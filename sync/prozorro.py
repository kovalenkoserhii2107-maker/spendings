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
import math
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


def search_page(edrpou, page, role="buyer", vrange=None):
    """One page of an organisation's procedures: ([tenderID], rows on the page, total), newest first.

    A buyer is searched among procedures (`buyer[]`); a supplier among
    contracts (`supplier[]` on /search/contracts), whose contractID is the
    tenderID plus a suffix ("UA-2026-10-15-007639-a-a1"). The search shows at
    most 1000 results (total says 1000 then); `vrange` = (from, to) limits it
    to procedures of that expected value, so a long history is read in parts.
    """
    query = {("supplier[]" if role == "supplier" else "buyer[]"): edrpou}
    if vrange:
        query["value[amount][start]"], query["value[amount][end]"] = vrange
    body = urllib.parse.urlencode(query).encode()
    if role == "supplier":
        res = _get("%s/search/contracts?page=%d" % (SITE, page), data=body)
        out = []
        for r in res.get("data") or []:
            m = re.match(r"^(UA-\d{4}-\d{2}-\d{2}-\d{6}-[a-z])-", r.get("contractID") or "")
            if m and m.group(1) not in out:
                out.append(m.group(1))
    else:
        res = _get("%s/search/tenders?page=%d" % (SITE, page), data=body)
        out = [r["tenderID"] for r in res.get("data") or [] if r.get("tenderID")]
    return out, len(res.get("data") or []), int(res.get("total") or 0)


SEARCH_CAP = SEARCH_PAGES * 20
# Value bands a long history is first cut into; a band still at the cap is halved.
VALUE_BANDS = (0, 1000, 3000, 10000, 30000, 100000, 300000, 1000000, 10000000, 10 ** 13)
DEEP_BUDGET_S = 15 * 60


def _split(lo, hi):
    """Two halves of a value band: geometric while it spans orders of magnitude."""
    mid = int(math.sqrt(max(lo, 1) * hi)) if hi > 4 * max(lo, 1) else (lo + hi) // 2
    return [[lo, mid], [mid, hi]] if lo < mid < hi else None


def deep_search(edrpou, role, deep, seen, log=print, budget=DEEP_BUDGET_S):
    """The whole history past the newest 1000, band by band (pz_state["deep"]).

    Picks up where the last run stopped; returns the tenderIDs not in `seen`.
    """
    started, found = time.time(), []
    bands = deep.setdefault("bands", [[VALUE_BANDS[i], VALUE_BANDS[i + 1]] for i in range(len(VALUE_BANDS) - 1)])
    while bands and time.time() - started < budget:
        lo, hi = bands[0]
        ids, raw, total = search_page(edrpou, 1, role, (lo, hi))
        if total >= SEARCH_CAP:
            halves = _split(lo, hi)
            if halves:
                bands[0:1] = halves
                continue
        page = deep.get("page") or 1
        if page > 1:
            ids, raw, total = search_page(edrpou, page, role, (lo, hi))
        while True:
            for i in ids:
                if i not in seen:
                    seen.add(i)
                    found.append(i)
            if raw < 20 or page >= SEARCH_PAGES:
                break
            if time.time() - started > budget:
                deep["page"] = page + 1
                return found
            page += 1
            ids, raw, total = search_page(edrpou, page, role, (lo, hi))
        deep.pop("page", None)
        bands.pop(0)
    if not bands:
        deep["done"] = time.strftime("%Y-%m-%d", time.gmtime())
    log("  prozorro: архів за вартістю — знайдено %d, частин лишилось %d" % (len(found), len(bands)))
    return found


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
            "id": d.get("id") or "",
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


# "DREAM-UA-230125-E8BA4383", often typed with spaces around the dashes.
DREAM_ID = re.compile(r"DREAM\s*[-‐‑–]\s*UA\s*[-‐‑–]\s*(\d{6})\s*[-‐‑–]\s*([0-9A-Za-z]{8})")
OPEN_COMPLAINT = {"draft", "claim", "answered", "pending", "accepted"}


def _items(items):
    """A contract's specification: what, CPV, how many, unit and unit price."""
    out = []
    for it in items or []:
        cls, unit = it.get("classification") or {}, it.get("unit") or {}
        out.append({k: v for k, v in {
            "name": it.get("description") or "",
            "cpv": cls.get("id") or "",
            "qty": it.get("quantity"),
            "unit": unit.get("name") or unit.get("code") or "",
            "price": (unit.get("value") or {}).get("amount"),
        }.items() if v not in (None, "")})
    return out


def _awards(t):
    """Every qualification decision, the rejected ones too (status "unsuccessful")."""
    out = []
    for a in t.get("awards") or []:
        sup = _org((a.get("suppliers") or [{}])[0])
        out.append({k: v for k, v in {
            "id": a.get("id"), "status": a.get("status"), "date": _day(a.get("date")),
            "amount": (a.get("value") or {}).get("amount"),
            "supplier_code": sup.get("code"), "supplier_name": sup.get("name"),
            "lot": a.get("lotID"), "title": a.get("title") or a.get("description") or "",
        }.items() if v not in (None, "")})
    return out


def _complaints(t):
    out = []
    for c in (t.get("complaints") or []) + [c for a in t.get("awards") or [] for c in a.get("complaints") or []]:
        out.append({k: v for k, v in {
            "id": c.get("id"), "status": c.get("status"), "type": c.get("type"),
            "title": c.get("title") or "", "date": _day(c.get("dateSubmitted") or c.get("date")),
        }.items() if v not in (None, "")})
    return out


def _dream(t):
    text = " ".join([t.get("title") or "", t.get("description") or ""]
                    + [i.get("description") or "" for i in t.get("items") or []]
                    + [str(p.get("id") or "") for p in t.get("plans") or []])
    m = DREAM_ID.search(text)
    return "DREAM-UA-%s-%s" % (m.group(1), m.group(2).upper()) if m else ""


# EIB sub-project code: region letters, object number (+ letter), contract number, as in
# "OD08_03", "ZK04A_01"; found in contract numbers, titles and file names.
SUBPROJECT = re.compile(r"(?<![A-Z0-9])([A-Z]{2}\d{2}[A-Z]?)_(\d{2})(?![0-9])")
_TO_LATIN = str.maketrans("АВСЕНІКМОРТХ", "ABCEHIKMOPTX")


def subproject(t, contracts=None):
    """{"code": "OD08_03", "object": "OD08"} or None."""
    cs = contracts if contracts is not None else t.get("contracts") or []
    texts = [c.get("number") for c in cs] + [t.get("title")] \
        + [d.get("title") for c in cs for d in c.get("docs") or []] + [d.get("title") for d in t.get("docs") or []]
    for x in texts:
        m = SUBPROJECT.search(str(x or "").upper().translate(_TO_LATIN))
        if m and not m.group(1).startswith("UA"):
            return {"code": "%s_%s" % (m.group(1), m.group(2)), "object": m.group(1)}
    return None


# The object of a works procurement, as the related ones (design, technical and author's
# supervision, expert review) name it: the title without the CPV prefix.
_CPV_PREFIX = re.compile(r"^\s*(?:ДК\s*021[:\-]?\s*2015\s*\(?CPV\)?\s*)?\d{8}-\d\s*[-–—:]?\s*", re.I)
RELATED_ROLES = (
    ("supervision", re.compile(r"технічн\w*\s+нагляд", re.I)),
    ("author", re.compile(r"авторськ\w*\s+нагляд", re.I)),
    ("expertise", re.compile(r"експертиз", re.I)),
    ("design", re.compile(r"проє?кт\w*\s*[-–]?\s*кошторисн|проє?ктуванн|розробленн\w*\s+проє?кт|\bпкд\b|робоч\w+\s+проє?кт", re.I)),
    ("works", re.compile(r"будівництв|реконструкці|капітальн\w*\s+ремонт|ремонт|монтаж", re.I)),
)


def object_name(title):
    words = _CPV_PREFIX.sub("", str(title or "")).replace("«", " ").replace("»", " ").replace('"', " ").split()
    return " ".join(words[:14])


def related_role(title):
    for role, rx in RELATED_ROLES:
        if rx.search(title or ""):
            return role
    return "other"


def related(buyer, title, own_tid):
    """The buyer's other procedures for the same object: [{tid, title, status, value, role}]."""
    q = object_name(title)
    if not buyer or len(q) < 12:
        return []
    body = urllib.parse.urlencode({"buyer[]": buyer, "text": q}).encode()
    res = _get("%s/search/tenders?page=1" % SITE, data=body)
    out = []
    for r in res.get("data") or []:
        if r.get("tenderID") == own_tid:
            continue
        v = r.get("value") or {}
        out.append({"tid": r.get("tenderID"), "title": (r.get("title") or "")[:300], "status": r.get("status"),
                    "value": {"amount": v.get("amount"), "currency": v.get("currency")} if v else None,
                    "role": related_role(r.get("title"))})
    return out


def _subcontracts(c, t):
    """Subcontractors named in the contract or in the winning bid."""
    found = [str(v) for k, v in c.items() if "subcontract" in k.lower() and v]
    award = next((a for a in t.get("awards") or [] if a.get("id") == c.get("awardID")), {})
    for b in t.get("bids") or []:
        if b.get("id") and b.get("id") == award.get("bid_id"):
            found += [str(lv.get("subcontractingDetails")) for lv in b.get("lotValues") or [] if lv.get("subcontractingDetails")]
            if b.get("subcontractingDetails"):
                found.append(str(b["subcontractingDetails"]))
    return [x[:500] for x in dict.fromkeys(found)]


def compact_contract(c, lot, t=None):
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
        "items": _items(c.get("items")),
        "subcontracts": _subcontracts(c, t or {}),
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
        "buyer_name": _org(t.get("procuringEntity")).get("name"),
        "region": ((t.get("procuringEntity") or {}).get("address") or {}).get("region") or "",
        # Donors (code list: XM-DAC 33000 = European Investment Bank, 44000 = World Bank, ...).
        "funders": [{"code": (f.get("identifier") or {}).get("id") or "", "name": f.get("name") or (f.get("identifier") or {}).get("legalName") or ""}
                    for f in t.get("funders") or []],
        "rationale": t.get("procurementMethodRationale") or "",
        "bids": t.get("numberOfBids") if t.get("numberOfBids") is not None else (len(t["bids"]) if t.get("bids") else None),
        "lots": lots or None,
        "cancel": cancel[0] if cancel else "",
        "milestones": milestones(t),
        "docs": documents(t.get("documents")),
        "awards": _awards(t),
        "complaints": _complaints(t),
        "questions_count": len(t.get("questions") or []) or None,
        "questions_unanswered": sum(1 for q in t.get("questions") or [] if not q.get("answer")) or None,
        "guarantee": {"amount": (t.get("guarantee") or {}).get("amount"), "currency": (t.get("guarantee") or {}).get("currency")}
        if (t.get("guarantee") or {}).get("amount") else None,
        "dream_id": _dream(t),
        "contracts": contracts,
        "modified": t.get("dateModified"),
    }.items() if v not in (None, "", [])}


# An organisation on monitoring keeps a short list of its procedures: enough to show them
# and to pair its contracts with the Treasury. Documents, payment terms, awards and the
# rest are read only for a contract taken on control (tracked.py loads the full record).
SHORT_TENDER = ("id", "tid", "title", "method", "status", "date", "deadline", "value", "category", "cpv",
                "buyer", "buyer_name", "region", "funders", "bids", "lots", "cancel", "contracts", "modified", "_at")
SHORT_CONTRACT = ("id", "cid", "number", "title", "status", "signed", "start", "end", "value", "paid",
                  "suppliers", "lot", "sp", "termination", "modified")


def short_tender(t):
    out = {k: t[k] for k in SHORT_TENDER if k in t}
    out["contracts"] = [{k: c[k] for k in SHORT_CONTRACT if k in c} for c in t.get("contracts") or []]
    out["_v"] = SHORT
    return out


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
        contracts.append(compact_contract(full, lot_of_award.get(ref.get("awardID")), t))
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

SCHEMA = 2  # full records (contracts on control, EIB catalogue): awards, complaints, questions, DREAM id, items
SHORT = "short-1"  # an organisation's short list
NEW_PER_RUN = 1000      # new procedures per organisation per run (~25 min at the site's rate)
REFRESH_PER_RUN = 150   # open procedures re-read per organisation per run
REFRESH_AFTER_H = 20
TIME_BUDGET_S = 40 * 60  # per organisation
RUN_BUDGET_S = 80 * 60   # all organisations together: the workflow stops at 120 minutes
_RUN_STARTED = time.time()


def own_contracts(rec, edrpou, role):
    """A supplier sees only its own contracts of a procedure (other lots go to others)."""
    if role == "supplier":
        rec["contracts"] = [c for c in rec.get("contracts") or [] if any(s.get("code") == edrpou for s in c.get("suppliers") or [])]
    return rec


def sync(edrpou, tenders, pz_state, log=print, role="buyer"):
    """Bring `tenders` ({tenderID: record}) up to date. Returns a list of errors.

    New procedures found by the search wait in pz_state["queue"], so a long
    backfill spreads over several runs and an outage loses nothing.
    """
    started, errors = time.time(), []
    budget = max(0, min(TIME_BUDGET_S, _RUN_STARTED + RUN_BUDGET_S - started))
    # Records stored in full before the short list: cut down in place, nothing re-read.
    for tid, rec in list(tenders.items()):
        if rec.get("_v") != SHORT:
            tenders[tid] = short_tender(rec)
    queue = pz_state.setdefault("queue", [])
    queued = set(queue) | set(pz_state.get("missing") or [])

    # 1. New procedures, newest first, until a page brings nothing new.
    found, capped = 0, False
    try:
        for page in range(1, SEARCH_PAGES + 1):
            ids, raw, total = search_page(edrpou, page, role)
            capped = capped or total >= SEARCH_CAP
            new = [i for i in ids if i not in tenders and i not in queued]
            queue.extend(new)
            queued.update(new)
            found += len(new)
            if raw < 20 or page == SEARCH_PAGES:
                pz_state["backfilled"] = True
                break
            if pz_state.get("backfilled") and not new:
                break
        # More than the search shows: read the older part once, in value bands.
        deep = pz_state.get("deep") or {}
        if (capped or deep) and not deep.get("done"):
            pz_state["deep"] = deep
            older = deep_search(edrpou, role, deep, queued | set(tenders), log)
            queue.extend(older)
            found += len(older)
    except ProzorroError as e:
        errors.append("пошук: %s" % e)
    log("  prozorro: знайдено нових процедур %d, у черзі %d" % (found, len(queue)))

    # 2. Download what is queued, newest first (the search order).
    done = 0
    for tid in list(queue):
        if done >= NEW_PER_RUN or time.time() - started > budget:
            break
        try:
            rec = short_tender(own_contracts(load_tender(internal_id(tid)), edrpou, role))
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
            fresh = short_tender(own_contracts(load_tender(rec["id"]), edrpou, role))
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


def link(tenders, treasury_contracts, role="buyer"):
    """Pair Prozorro contracts with the organisation's Treasury contracts.

    The supplier must always match. Then, in order of trust: the Treasury record
    names the tender and the number matches (or the tender has one contract); the
    number matches within a month; the price matches within a month. Prices are
    not compared in the first two: Prozorro shows the price after changes, the
    Treasury the price at signing. Returns {treasury id: (tenderID, contract id)}
    and writes "sp" (the Treasury id) into each linked Prozorro contract.
    """
    # A buyer's Treasury contracts name the supplier as the other party; a
    # supplier's (role "contractor") name the buyer, whose code is always public.
    side = "contractor" if role == "supplier" else "disposer"
    by_tender, rows = {}, [c for c in treasury_contracts if c.get("role") == side]
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
            if role == "supplier":
                codes, names = {t.get("buyer")}, []
            else:
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
