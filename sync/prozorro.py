"""Procurement data from Prozorro: procedures, payment terms, contracts, documents.

Facts this module relies on (checked against the live services, 2026-11-16):
  * The official API (public-api.prozorro.gov.ua/api/2.5) serves a tender or a
    contract by its internal id, but cannot search by the buyer's EDRPOU.
  * The search behind prozorro.gov.ua can: POST /api/search/tenders with
    `buyer[]=<EDRPOU>` returns tenderIDs newest first, 20 per page, at most
    50 pages (the 1000 newest procedures). It has no date filter we could use.
  * prozorro.gov.ua/api/tenders/<tenderID>/summary gives the internal id.
  * prozorro.gov.ua allows 60 requests a minute (x-ratelimit-limit), so calls
    there are spaced out; the official API has no such limit.
  * Payment terms live in tender.milestones (type "financing": prepayment or
    postpayment, a share of the price and a term after an event); a milestone
    may belong to one lot, and a contract's lot comes from its award.
  * Documents come in versions with the same id; the newest one is current.
    Each signed file has a "sign.p7s" companion, which is not worth showing.
"""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

import spending

SITE = "https://prozorro.gov.ua/api"
API = "https://public-api.prozorro.gov.ua/api/2.5"
USER_AGENT = "Mozilla/5.0 (compatible; spending-monitor)"
SEARCH_PAGES = 50
SITE_GAP = 1.1          # seconds between prozorro.gov.ua requests (60 per minute)
FINAL_TENDER = {"complete", "cancelled", "unsuccessful"}
FINAL_CONTRACT = {"terminated", "cancelled"}

_last_site_call = [0.0]


class ProzorroError(Exception):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def _get(url, data=None, timeout=60, retries=4):
    last = None
    for attempt in range(retries):
        if url.startswith(SITE):
            wait = _last_site_call[0] + SITE_GAP - time.time()
            if wait > 0:
                time.sleep(wait)
            _last_site_call[0] = time.time()
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout, context=spending._ctx) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(int(e.headers.get("Retry-After") or 30))
                last = ProzorroError("HTTP 429 (забагато запитів)")
                continue
            if e.code < 500:
                raise ProzorroError("HTTP %s: %s" % (e.code, url), e.code)
            last = ProzorroError("HTTP %s: %s" % (e.code, url))
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            last = ProzorroError("Немає звʼязку з Prozorro: %s" % e)
        time.sleep(3 * (attempt + 1))
    raise last


def search_page(edrpou, page):
    """One page of the buyer's procedures: [tenderID], newest first."""
    body = urllib.parse.urlencode({"buyer[]": edrpou}).encode()
    res = _get("%s/search/tenders?page=%d" % (SITE, page), data=body)
    return [r["tenderID"] for r in res.get("data") or [] if r.get("tenderID")]


def internal_id(tender_id):
    return _get("%s/tenders/%s/summary" % (SITE, urllib.parse.quote(tender_id)))["id"]


def fetch_tender(pid):
    return _get("%s/tenders/%s" % (API, pid))["data"]


def fetch_contract(cid):
    return _get("%s/contracts/%s" % (API, cid))["data"]


# ---- compact records: what the site shows, not the whole API object ----------------------------

def _day(value):
    return (value or "")[:10] or None


def _tid_day(tid):
    m = re.match(r"^UA-(\d{4}-\d{2}-\d{2})-", tid or "")
    return m.group(1) if m else None


def _value(v):
    v = v or {}
    if v.get("amount") is None:
        return None
    return {"amount": v["amount"], "currency": v.get("currency") or "UAH", "vat": v.get("valueAddedTaxIncluded")}


def _org(o):
    o = o or {}
    ident = o.get("identifier") or {}
    return {"name": ident.get("legalName") or o.get("name") or "", "code": ident.get("id") or ""}


def documents(docs):
    """Current versions of the documents, signatures left out, oldest first."""
    latest = {}
    for d in docs or []:
        title = d.get("title") or ""
        if title.endswith(".p7s") or d.get("format") == "application/pkcs7-signature":
            continue
        key = d.get("id") or d.get("url")
        if key not in latest or (d.get("dateModified") or "") >= (latest[key].get("dateModified") or ""):
            latest[key] = d
    out = []
    for d in latest.values():
        out.append({k: v for k, v in {
            "title": d.get("title") or "",
            "type": d.get("documentType") or "",
            "url": d.get("url") or "",
            "date": d.get("datePublished") or d.get("dateModified") or "",
            "of": d.get("documentOf") or "",
        }.items() if v})
    out.sort(key=lambda d: d.get("date", ""))
    return out


def milestones(t):
    out = []
    for m in t.get("milestones") or []:
        dur = m.get("duration") or {}
        out.append({k: v for k, v in {
            "type": m.get("type"),             # financing | delivery
            "code": m.get("code"),             # prepayment | postpayment | standard
            "event": m.get("title"),           # signingTheContract, submittingServices, ...
            "text": m.get("description") or "",
            "pct": m.get("percentage"),
            "days": dur.get("days"),
            "days_type": dur.get("type"),      # calendar | working | banking
            "seq": m.get("sequenceNumber"),
            "lot": m.get("relatedLot"),
        }.items() if v not in (None, "")})
    out.sort(key=lambda m: (m.get("seq") or 0))
    return out


def compact_contract(c, lot):
    changes = []
    for ch in c.get("changes") or []:
        changes.append({k: v for k, v in {
            "date": _day(ch.get("dateSigned") or ch.get("date")),
            "status": ch.get("status"),
            "text": ch.get("rationale") or "",
            "types": ch.get("rationaleTypes") or [],
            "number": ch.get("contractNumber") or "",
        }.items() if v not in (None, "", [])})
    period = c.get("period") or {}
    return {k: v for k, v in {
        "id": c.get("id"),
        "cid": c.get("contractID"),
        "number": c.get("contractNumber") or "",
        "title": c.get("title") or "",
        "status": c.get("status"),
        "signed": _day(c.get("dateSigned")),
        "start": _day(period.get("startDate")),
        "end": _day(period.get("endDate")),
        "value": _value(c.get("value")),
        "paid": _value(c.get("amountPaid")),
        "termination": c.get("terminationDetails") or "",
        "suppliers": [_org(s) for s in c.get("suppliers") or []],
        "lot": lot,
        "changes": changes,
        "docs": documents(c.get("documents")),
        "modified": c.get("dateModified"),
    }.items() if v not in (None, "", [])}


def compact_tender(t, contracts):
    items = t.get("items") or []
    cls = (items[0].get("classification") or {}) if items else {}
    lots = {l.get("id"): l.get("title") or "" for l in t.get("lots") or []}
    tender_period = t.get("tenderPeriod") or {}
    cancel = [c.get("reason") for c in t.get("cancellations") or [] if c.get("status") == "active" and c.get("reason")]
    return {k: v for k, v in {
        "id": t.get("id"),
        "tid": t.get("tenderID"),
        "title": t.get("title") or "",
        "method": t.get("procurementMethodType") or "",
        "status": t.get("status") or "",
        # "date" moves with every status change; the procedure's own date is when it was created.
        "date": _day(t.get("dateCreated")) or _tid_day(t.get("tenderID")) or _day(t.get("date")),
        "deadline": _day(tender_period.get("endDate")),
        "value": _value(t.get("value")),
        "category": t.get("mainProcurementCategory") or "",
        "cpv": "%s %s" % (cls.get("id") or "", cls.get("description") or "") if cls else "",
        "buyer": _org(t.get("procuringEntity")).get("code"),
        "rationale": t.get("procurementMethodRationale") or "",
        "bids": t.get("numberOfBids"),
        "lots": lots or None,
        "cancel": cancel[0] if cancel else "",
        "milestones": milestones(t),
        "docs": documents(t.get("documents")),
        "contracts": contracts,
        "modified": t.get("dateModified"),
    }.items() if v not in (None, "", [])}


def load_tender(pid):
    """A tender with its contracts, both compacted."""
    t = fetch_tender(pid)
    lot_of_award = {a.get("id"): a.get("lotID") for a in t.get("awards") or []}
    contracts = []
    for ref in t.get("contracts") or []:
        if ref.get("status") in ("cancelled",) and not ref.get("dateSigned"):
            continue  # a contract that never got signed
        try:
            full = fetch_contract(ref["id"])
        except ProzorroError:
            full = ref  # the tender's copy is shorter but still useful
        contracts.append(compact_contract(full, lot_of_award.get(ref.get("awardID"))))
    return compact_tender(t, contracts)


def is_final(tender):
    """Nothing more to expect: the procedure is over and its contracts are closed
    or ended long ago (buyers often never close a contract formally)."""
    if tender.get("status") not in FINAL_TENDER:
        return False
    long_ago = (spending.today() - timedelta(days=120)).isoformat()
    return all(c.get("status") in FINAL_CONTRACT or (c.get("end") or "9999") < long_ago
               for c in tender.get("contracts") or [])


# ---- one organisation -------------------------------------------------------------------------

NEW_PER_RUN = 1000      # new procedures per organisation per run (~25 min at the site's rate)
REFRESH_PER_RUN = 150   # open procedures re-read per organisation per run
REFRESH_AFTER_H = 20
TIME_BUDGET_S = 40 * 60  # per organisation
RUN_BUDGET_S = 80 * 60   # all organisations together: the workflow stops at 120 minutes
_RUN_STARTED = time.time()


def sync(edrpou, tenders, pz_state, log=print):
    """Bring `tenders` ({tenderID: record}) up to date. Returns a list of errors.

    New procedures found by the search wait in pz_state["queue"], so a long
    backfill spreads over several runs and an outage loses nothing.
    """
    started, errors = time.time(), []
    budget = max(0, min(TIME_BUDGET_S, _RUN_STARTED + RUN_BUDGET_S - started))
    queue = pz_state.setdefault("queue", [])
    queued = set(queue) | set(pz_state.get("missing") or [])

    # 1. New procedures, newest first, until a page brings nothing new.
    found = 0
    try:
        for page in range(1, SEARCH_PAGES + 1):
            ids = search_page(edrpou, page)
            new = [i for i in ids if i not in tenders and i not in queued]
            queue.extend(new)
            queued.update(new)
            found += len(new)
            if len(ids) < 20 or page == SEARCH_PAGES:
                pz_state["backfilled"] = True
                break
            if pz_state.get("backfilled") and not new:
                break
    except ProzorroError as e:
        errors.append("пошук: %s" % e)
    log("  prozorro: знайдено нових процедур %d, у черзі %d" % (found, len(queue)))

    # 2. Download what is queued, newest first (the search order).
    done = 0
    for tid in list(queue):
        if done >= NEW_PER_RUN or time.time() - started > budget:
            break
        try:
            rec = load_tender(internal_id(tid))
        except ProzorroError as e:
            if e.status in (403, 404, 410):  # gone or hidden for good: do not retry every run
                queue.remove(tid)
                pz_state.setdefault("missing", []).append(tid)
                continue
            errors.append("%s: %s" % (tid, e))
            if len(errors) > 20:
                break
            continue
        rec["_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        tenders[tid] = rec
        queue.remove(tid)
        done += 1
    log("  prozorro: завантажено %d, лишилось у черзі %d" % (done, len(queue)))

    # 3. Re-read procedures that can still change, the longest unread first.
    cutoff = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - REFRESH_AFTER_H * 3600))
    stale = sorted((r for r in tenders.values() if not is_final(r) and r.get("_at", "") < cutoff), key=lambda r: r.get("_at", ""))
    refreshed = 0
    for rec in stale[:REFRESH_PER_RUN]:
        if time.time() - started > budget:
            break
        try:
            fresh = load_tender(rec["id"])
        except ProzorroError as e:
            errors.append("%s: %s" % (rec.get("tid"), e))
            continue
        fresh["_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        tenders[rec["tid"]] = fresh
        refreshed += 1
    log("  prozorro: оновлено %d з %d відкритих" % (refreshed, len(stale)))
    return errors


# ---- links to the Treasury contracts --------------------------------------------------------

# Contract numbers are typed by hand: Latin letters that look Cyrillic, and "З" for "3".
_LOOKALIKE = str.maketrans("aceiopxykmhtbз", "асеіорхукмнтв3")


def _norm_number(value):
    return re.sub(r"[\s.№#]+", "", str(value or "")).lower().translate(_LOOKALIKE).rstrip("-/")


def _person(name):
    """("surname", "initials") of a sole trader: "ТКАЧ ІРИНА СЕРГІЇВНА" and
    "ФОП Ткач І.С." both give ("ткач", "іс")."""
    words = [w for w in re.split(r"[\s.,]+", re.sub(r"(?i)\bфоп\b|фізична особа[- ]підприємець", " ", str(name or "")).lower()) if w]
    if not words:
        return None, ""
    return words[0], "".join(w[0] for w in words[1:3])


def _same_supplier(treasury, codes, names):
    """The Treasury hides sole traders' codes (10 digits), leaving "ФОП Surname I.P.";
    those are compared by surname and, where both have them, initials."""
    code = treasury.get("party_code")
    if code and str(code).isdigit():
        return code in codes
    surname, initials = _person(treasury.get("party_name"))
    if not surname:
        return False
    for n in names:
        s2, i2 = _person(n)
        if s2 == surname and (not initials or not i2 or initials == i2[:len(initials)] or i2 == initials[:len(i2)]):
            return True
    return False


def _days_apart(a, b):
    try:
        return abs((date.fromisoformat(a[:10]) - date.fromisoformat(b[:10])).days)
    except (TypeError, ValueError):
        return 9999


def link(tenders, treasury_contracts):
    """Pair Prozorro contracts with the organisation's Treasury contracts.

    The supplier must always match. Then, in order of trust: the Treasury record
    names the tender and the number matches (or the tender has one contract); the
    number matches within a month; the price matches within a month. Prices are
    not compared in the first two: Prozorro shows the price after changes, the
    Treasury the price at signing. Returns {treasury id: (tenderID, contract id)}
    and writes "sp" (the Treasury id) into each linked Prozorro contract.
    """
    by_tender, rows = {}, [c for c in treasury_contracts if c.get("role") == "disposer"]
    for c in rows:
        if c.get("prozorro"):
            by_tender.setdefault(c["prozorro"], []).append(c)
    used, out = set(), {}

    def take(t, pc, c):
        used.add(c["id"])
        pc["sp"] = c["id"]
        out[c["id"]] = (t["tid"], pc["id"])

    pairs = [(t, pc) for t in tenders.values() for pc in t.get("contracts") or []]
    for _, pc in pairs:
        pc.pop("sp", None)
    for rule in (1, 2, 3):
        for t, pc in pairs:
            if pc.get("sp"):
                continue
            num = _norm_number(pc.get("number"))
            codes = {s.get("code") for s in pc.get("suppliers") or [] if s.get("code")}
            names = [s.get("name") for s in pc.get("suppliers") or [] if len(s.get("code") or "") == 10]
            amount = (pc.get("value") or {}).get("amount")
            pool = by_tender.get(t["tid"], []) if rule == 1 else rows
            for c in pool:
                if c["id"] in used:
                    continue
                near = _days_apart(c.get("date"), pc.get("signed")) <= 31
                same_num = num and _norm_number(c.get("number")) == num
                same_party = _same_supplier(c, codes, names)
                if (rule == 1 and same_party and (same_num or len(t.get("contracts") or []) == 1)
                        or rule == 2 and same_num and same_party and near
                        or rule == 3 and same_party and near and amount is not None and abs((c.get("value0") or 0) - amount) < 1):
                    take(t, pc, c)
                    break
    return out
