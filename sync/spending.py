"""Client for the open API of spending.gov.ua plus normalisation of its records.

Facts about the API this module relies on (checked against the live service):
  * no key is needed;
  * transactions require a payer or recipient EDRPOU and at most 92 days per request;
  * document searches return at most ~1000 records and flag `moreThenCount`;
  * an unknown EDRPOU on /v2/disposers/{edrpou} answers HTTP 500 "No data found".
"""
import json
import os
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

BASE = os.environ.get("SPENDING_API", "https://api.spending.gov.ua/api")
USER_AGENT = "Mozilla/5.0 (compatible; spending-monitor)"
MAX_TX_DAYS = 92

# Be a polite client: never more than a few requests in flight.
_slots = threading.BoundedSemaphore(3)

DOC_PATHS = {
    "contract": "/v2/disposers/contracts",
    "act": "/v2/disposers/acts",
    "addendum": "/v2/disposers/addendums",
    "peny": "/v2/disposers/peny",
}


class ApiError(Exception):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def _ssl_context():
    # python.org builds on macOS ship without a CA bundle; fall back to
    # certifi or the system bundle so verification stays on.
    paths = ssl.get_default_verify_paths()
    if paths.cafile and os.path.exists(paths.cafile):
        return ssl.create_default_context()
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        pass
    for candidate in ("/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt"):
        if os.path.exists(candidate):
            return ssl.create_default_context(cafile=candidate)
    return ssl.create_default_context()


_ctx = _ssl_context()


def get(path, params=None, timeout=120, retries=3):
    """GET a JSON resource. Raises ApiError on failure."""
    clean = {k: v for k, v in (params or {}).items() if v not in (None, "", [])}
    url = BASE + path + ("?" + urllib.parse.urlencode(clean, doseq=True) if clean else "")
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
            )
            with _slots:
                with urllib.request.urlopen(req, timeout=timeout, context=_ctx) as resp:
                    body = resp.read()
            return json.loads(body.decode("utf-8"))
        except urllib.error.HTTPError as e:
            message = ""
            try:
                message = json.loads(e.read().decode("utf-8")).get("errorMessage", "")
            except Exception:
                pass
            # 4xx and "No data found" are answers, not outages — do not retry.
            if e.code < 500 or "No data found" in message:
                raise ApiError(message or "HTTP %s" % e.code, e.code)
            last = ApiError(message or "HTTP %s" % e.code, e.code)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            last = ApiError("Нет связи с API spending.gov.ua: %s" % e)
        if attempt < retries - 1:
            time.sleep(2 * (attempt + 1))
    raise last


def today():
    return datetime.now(timezone.utc).date()


def parse_date(value):
    return date.fromisoformat(value[:10])


def windows(start, end, days):
    """Split [start, end] into consecutive closed windows of at most `days` days."""
    cur = start
    while cur <= end:
        stop = min(cur + timedelta(days=days - 1), end)
        yield cur, stop
        cur = stop + timedelta(days=1)


# ---- raw fetchers -----------------------------------------------------------


def fetch_card(edrpou):
    """Organisation card, or None when the portal does not know the code."""
    try:
        return get("/v2/disposers/" + urllib.parse.quote(edrpou, safe=""))
    except ApiError as e:
        if "No data found" in str(e):
            return None
        raise


def fetch_transactions(edrpou, role, start, end, window_days=31):
    """All transactions where `edrpou` is the payer or the recipient."""
    key = "payers_edrpous" if role == "payer" else "recipt_edrpous"
    out = []
    for a, b in windows(start, end, min(window_days, MAX_TX_DAYS)):
        out.extend(
            get(
                "/v2/api/transactions/",
                {key: edrpou, "startdate": a.isoformat(), "enddate": b.isoformat()},
            )
            or []
        )
    return out


PORTAL_START = date(2015, 1, 1)  # the portal has no documents before 2015


def fetch_documents(kind, edrpou, role, start=None, end=None):
    """Contracts / acts / addendums / penalties by signing date.

    Returns (documents, truncated). A response holds at most ~1000 records.
    The only reliable sign of a cut list is `count` exceeding the number of
    records returned: `moreThenCount` is set only once `count` hits its own
    ceiling of 5000. A cut date range is halved until every piece fits.
    """
    key = "disposerId" if role == "disposer" else "contractorId"
    params = {key: edrpou}
    if start and end:
        params["signDateFrom"] = start.isoformat()
        params["signDateTo"] = end.isoformat()
    res = get(DOC_PATHS[kind], params, timeout=180)
    docs = res.get("documents") or []
    cut = bool(res.get("moreThenCount")) or int(res.get("count") or 0) > len(docs)
    if not cut:
        return docs, False
    if not (start and end):
        return docs, True  # no range to split; see fetch_documents_history
    if start >= end:
        return docs, True  # a single day over the cap: keep what we got
    mid = start + (end - start) // 2
    left, t1 = fetch_documents(kind, edrpou, role, start, mid)
    right, t2 = fetch_documents(kind, edrpou, role, mid + timedelta(days=1), end)
    return left + right, t1 or t2


def fetch_documents_history(kind, edrpou, role, recent_days=365):
    """Everything the portal has, or the last `recent_days` for a huge organisation.

    Returns (documents, truncated).
    """
    key = "disposerId" if role == "disposer" else "contractorId"
    res = get(DOC_PATHS[kind], {key: edrpou}, timeout=180)
    docs = res.get("documents") or []
    huge = bool(res.get("moreThenCount"))
    if not huge and int(res.get("count") or 0) <= len(docs):
        return docs, False
    end = today() + timedelta(days=1)
    # Over 5000 documents the full history would take hundreds of requests.
    start = today() - timedelta(days=recent_days) if huge else PORTAL_START
    more, truncated = fetch_documents(kind, edrpou, role, start, end)
    return more, truncated or huge


def fetch_liabilities(edrpou, start, end):
    out = []
    for a, b in windows(start, end, 92):
        out.extend(
            get(
                "/v2/liabilities/fu",
                {"payer_edrpou": edrpou, "startdater": a.isoformat(), "enddater": b.isoformat()},
                timeout=180,
            )
            or []
        )
    return out


def fetch_fin_liabilities(system_key_fu):
    return get("/v2/liabilities/ff", {"system_key_fu": system_key_fu}) or []


def fetch_reports(edrpou, max_pages=20):
    out = []
    for page in range(max_pages):
        try:
            res = get(
                "/v2/api/reports/%s/page" % urllib.parse.quote(edrpou, safe=""),
                {"page": page, "size": 200},
            )
        except ApiError as e:
            # The portal answers 400 for a code that is not a registered
            # disposer: such an organisation simply has no reports.
            if e.status == 400:
                return out
            raise
        out.extend(res.get("content") or [])
        if page + 1 >= int(res.get("totalPages") or 0):
            break
    return out


_dict_cache = {}
_dict_lock = threading.Lock()


def _cached(name, loader, ttl=24 * 3600):
    with _dict_lock:
        hit = _dict_cache.get(name)
        if hit and time.time() - hit[0] < ttl:
            return hit[1]
    value = loader()
    with _dict_lock:
        _dict_cache[name] = (time.time(), value)
    return value


def report_types():
    def load():
        return {t["id"]: t.get("shortName") or t.get("name") for t in get("/v2/api/reports/report_types/")}

    return _cached("report_types", load)


def report_type_names():
    def load():
        return {t["id"]: t.get("name") for t in get("/v2/api/reports/report_types/")}

    return _cached("report_type_names", load)


def report_periods():
    def load():
        return {p["id"]: p.get("name") for p in get("/v2/api/reports/periods/")}

    return _cached("report_periods", load)


def last_load():
    """Date of the latest Treasury upload, or None."""
    try:
        rows = get("/v2/api/transactions/lastload", retries=1, timeout=30)
        for r in rows:
            if r.get("sourceId") == 2:
                return r.get("lastLoad")
    except ApiError:
        pass
    return None


# ---- normalisation ----------------------------------------------------------


def _join(parts, sep=" · "):
    return sep.join(str(p).strip() for p in parts if p not in (None, "") and str(p).strip())


def _contractors(doc):
    people = doc.get("contractors") or []
    names = _join([c.get("name") for c in people], ", ")
    ids = [c.get("identifier") for c in people if c.get("identifier") and c.get("identifier") != "HIDDEN"]
    return (ids[0] if ids else None), names or None


def normalize(kind, raw, org_edrpou, name_lookup=None):
    """Reduce an API record to the common columns the app lists and filters by.

    `name_lookup(edrpou)` resolves a disposer's name when the tracked
    organisation is the contractor (the API gives only the disposer's code).
    """
    if kind == "transaction":
        is_payer = raw.get("payer_edrpou") == org_edrpou
        other = "recipt" if is_payer else "payer"
        return {
            "ext_id": str(raw.get("id")),
            "date": (raw.get("trans_date") or "")[:10] or None,
            "amount": raw.get("amount"),
            "currency": raw.get("currency") or "UAH",
            "role": "payer" if is_payer else "recipient",
            "cp_edrpou": raw.get(other + "_edrpou"),
            "cp_name": raw.get(other + "_name"),
            "title": raw.get("payment_details") or "",
        }
    if kind in DOC_PATHS:
        is_disposer = raw.get("edrpou") == org_edrpou
        if is_disposer:
            cp_edrpou, cp_name = _contractors(raw)
        else:
            cp_edrpou = raw.get("edrpou")
            cp_name = name_lookup(cp_edrpou) if name_lookup and cp_edrpou else None
        number = raw.get("documentNumber")
        specs = _join([s.get("specificationName") for s in (raw.get("specifications") or [])[:3]], "; ")
        if kind == "contract":
            title = _join(["№ " + number if number else None, raw.get("subject")])
        elif kind == "addendum":
            title = _join(["Допсоглашение № " + number if number else "Допсоглашение", raw.get("subject")])
        elif kind == "act":
            title = _join(["Акт № " + number if number else "Акт", specs])
        else:
            title = "Штрафная санкция № " + number if number else "Штрафная санкция"
        return {
            "ext_id": str(raw.get("id")),
            "date": (raw.get("signDate") or raw.get("documentDate") or "")[:10] or None,
            "amount": raw.get("amount"),
            "currency": raw.get("currency") or "UAH",
            "role": "disposer" if is_disposer else "contractor",
            "cp_edrpou": cp_edrpou,
            "cp_name": cp_name,
            "title": title,
        }
    if kind == "liability":
        # One obligation (system_key_fu) has a row per registration: the same
        # key repeats with its own date, sequence number and amount.
        return {
            "ext_id": "%s-%s-%s" % (raw.get("system_key_fu"), (raw.get("dater") or "")[:10], raw.get("nr")),
            "date": (raw.get("dater") or "")[:10] or None,
            "amount": raw.get("s"),
            "currency": raw.get("currency") or "UAH",
            "role": "payer",
            "cp_edrpou": None,
            "cp_name": None,
            "title": _join(
                [
                    "КЕКВ %s %s" % (raw.get("kekv"), raw.get("kekv_name") or "") if raw.get("kekv") else None,
                    "договор " + raw["contractNumber"] if raw.get("contractNumber") else None,
                    raw.get("note"),
                ]
            ),
        }
    if kind == "report":
        try:
            type_name = report_types().get(raw.get("reportTypeId"))
            period = report_periods().get(raw.get("periodId"))
        except ApiError:
            type_name = period = None
        return {
            "ext_id": str(raw.get("reportId")),
            "date": (raw.get("publishDate") or raw.get("createDate") or "")[:10] or None,
            "amount": None,
            "currency": None,
            "role": "owner",
            "cp_edrpou": None,
            "cp_name": None,
            "title": _join([type_name or "Отчёт", period, raw.get("progKlasCod")]),
        }
    raise ValueError("unknown kind: %s" % kind)
