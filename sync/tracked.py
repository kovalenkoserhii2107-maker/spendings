"""Contracts on control: the ones an analyst picked in the app.

An analyst takes a Prozorro contract "on control" in the app; the request lands
in the Firestore collection `tracked` (publicly readable, like `watchlist`).
Every run this module re-reads each active contract in full and writes:

  data/tracked/<contract id>.json   the contract, its procedure, payment terms,
                                    Treasury payments and the history of changes
  data/tracked/index.json           one summary row per contract

Payments come from the Treasury, always from the buyer's side: the buyer's code
is public, while a sole trader's code is masked ("xxxxxxxxxx") in payments, so
the recipient is recognised by code or by surname. A payment belongs to the
contract when its purpose names the contract number; other payments between
the same parties during the contract are kept as "possibly related".
"""
import json
import os
import re
import urllib.request
from datetime import date, timedelta

import analysis
import prozorro
import spending

URL = ("https://firestore.googleapis.com/v1/projects/spending-monitor-2122b/"
       "databases/(default)/documents/tracked?pageSize=300")
KEY_RE = re.compile(r"^[0-9a-f]{32}$")
OVERLAP_DAYS = 7
HISTORY_SIZE = 300


def requests_from_app():
    """Contracts someone follows: [{"key", "org", "tid", "sp", "note", "addedAt", "followers"}]."""
    out, url = [], URL
    while url:
        req = urllib.request.Request(url, headers={"User-Agent": "spending-monitor-sync"})
        with urllib.request.urlopen(req, context=spending._ctx, timeout=30) as res:
            page = json.loads(res.read().decode("utf-8"))
        for doc in page.get("documents", []):
            key = doc["name"].rsplit("/", 1)[-1]
            f = doc.get("fields", {})
            val = lambda k: (f.get(k) or {}).get("stringValue") or ""
            active = (f.get("active") or {}).get("booleanValue", True)
            followers = [v.get("stringValue") for v in ((f.get("followers") or {}).get("arrayValue") or {}).get("values", [])
                         if v.get("stringValue")]
            if "followers" not in f and active and val("addedBy"):
                followers = [val("addedBy")]  # picked before contracts had followers
            if KEY_RE.match(key) and followers and val("tid"):
                out.append({"key": key, "org": val("org"), "tid": val("tid"), "sp": val("sp"), "followers": followers,
                            "note": val("note")[:500], "addedAt": (f.get("addedAt") or {}).get("timestampValue", "")})
        token = page.get("nextPageToken")
        url = URL + "&pageToken=" + token if token else None
    return out


# ---- payments ------------------------------------------------------------------------------

def _surname(name):
    return prozorro._person(name)[0]


def _is_supplier(tx, codes, surnames):
    code = str(tx.get("recipt_edrpou") or "")
    if code.isdigit():
        return code in codes
    return _surname(tx.get("recipt_name")) in surnames


def _names_contract(tx, number, signed):
    """The purpose names this contract: same number, and the date (if any) within a week."""
    want = prozorro._norm_number(number)
    if not want:
        return False
    for num, day in analysis.parse_contract_refs(tx.get("payment_details")):
        if prozorro._norm_number(num) == want and (not signed or abs((day - date.fromisoformat(signed)).days) <= 7):
            return True
    return False


def fetch_payments(buyer, supplier_codes, start, end):
    """Treasury payments from the buyer in [start, end], narrowed to one supplier
    when its code is public (a legal entity)."""
    legal = [c for c in supplier_codes if len(c) == 8]
    out = []
    for a, b in spending.windows(start, end, spending.MAX_TX_DAYS):
        params = {"payers_edrpous": buyer, "startdate": a.isoformat(), "enddate": b.isoformat()}
        if len(legal) == 1:
            params["recipt_edrpous"] = legal[0]
        out.extend(spending.get("/v2/api/transactions/", params) or [])
    return out


# ---- what is due -----------------------------------------------------------------------------

def _add_days(day, n, kind):
    """Day + n calendar days, or n working/banking days (weekends skipped)."""
    if kind in ("working", "banking"):
        while n > 0:
            day += timedelta(days=1)
            if day.weekday() < 5:
                n -= 1
        return day
    return day + timedelta(days=n)


def schedule(value, signed, milestones, acts, today):
    """Payment stages with the amount each one makes due and, where the event date
    is known, the due date. Post-payment after delivery is due per Treasury act."""
    stages, due_now = [], 0.0
    for m in milestones:
        if m.get("type") != "financing":
            continue
        share = (m.get("pct") or 0) / 100.0
        amount = round(value * share, 2)
        stage = {"code": m.get("code"), "event": m.get("event"), "pct": m.get("pct"), "days": m.get("days"),
                 "days_type": m.get("days_type"), "text": m.get("text") or "", "amount": amount, "due": None, "due_now": 0.0}
        if m.get("event") == "signingTheContract" and signed:
            stage["due"] = _add_days(date.fromisoformat(signed), m.get("days") or 0, m.get("days_type")).isoformat()
            if stage["due"] <= today:
                stage["due_now"] = amount
        elif m.get("event") in ("deliveryOfGoods", "submittingServices", "executionOfWorks", "dateOfInvoicing") and acts:
            # Each act (delivery, services, works) makes its share payable after the term.
            for a in acts:
                if not a.get("date"):
                    continue
                due = _add_days(date.fromisoformat(a["date"]), m.get("days") or 0, m.get("days_type")).isoformat()
                if due <= today:
                    stage["due_now"] += round((a.get("amount") or 0) * share, 2)
            stage["due_now"] = round(min(stage["due_now"], amount), 2)
        due_now += stage["due_now"]
        stages.append(stage)
    return stages, round(due_now, 2)


# ---- one contract --------------------------------------------------------------------------

def _event(kind, **params):
    return dict(params, type=kind, at=spending.today().isoformat())


def _diff(old, new):
    """History events between two snapshots of a contract."""
    if not old:
        return [_event("tracked")]
    ev = []
    oc, nc = old.get("contract") or {}, new.get("contract") or {}
    if oc.get("status") != nc.get("status"):
        ev.append(_event("status", old=oc.get("status"), new=nc.get("status")))
    ov, nv = (oc.get("value") or {}).get("amount"), (nc.get("value") or {}).get("amount")
    if ov != nv:
        ev.append(_event("value", old=ov, new=nv))
    if oc.get("end") != nc.get("end"):
        ev.append(_event("end", old=oc.get("end"), new=nc.get("end")))
    seen = {json.dumps(c, sort_keys=True) for c in oc.get("changes") or []}
    for ch in nc.get("changes") or []:
        if json.dumps(ch, sort_keys=True) not in seen:
            ev.append(_event("change", date=ch.get("date"), types=ch.get("types") or [], text=ch.get("text") or ""))
    docs = lambda s: {d.get("id") or d.get("url") for d in (s.get("contract") or {}).get("docs") or []} | {
        d.get("id") or d.get("url") for d in (s.get("tender") or {}).get("docs") or []}
    old_docs = docs(old)
    for d in ((nc.get("docs") or []) + ((new.get("tender") or {}).get("docs") or [])):
        if (d.get("id") or d.get("url")) not in old_docs:
            ev.append(_event("doc", title=d.get("title"), doc_type=d.get("type"), date=(d.get("date") or "")[:10]))
    old_pay = {p["id"] for p in old.get("payments") or []}
    for p in new.get("payments") or []:
        if p["id"] not in old_pay:
            ev.append(_event("payment", date=p["date"], amount=p["amount"], sure=p["sure"]))
    ots, nts = (old.get("tender") or {}).get("status"), (new.get("tender") or {}).get("status")
    if ots != nts:
        ev.append(_event("tender_status", old=ots, new=nts))
    return ev


def sync_one(req, old, tenders_by_org, treasury_by_org, log=print):
    """Fresh snapshot of one contract on control (old = the previous one or None)."""
    key = req["key"]
    tender_id = (old or {}).get("tender_id") or (tenders_by_org.get(req["org"], {}).get(req["tid"]) or {}).get("id")
    if not tender_id:
        tender_id = prozorro.internal_id(req["tid"])
    tender = prozorro.load_tender(tender_id)
    contract = next((c for c in tender.get("contracts") or [] if c.get("id") == key), None)
    if not contract:
        raise prozorro.ProzorroError("договору %s немає в закупівлі %s" % (key, req["tid"]))
    tender.pop("contracts", None)

    buyer = tender.get("buyer") or ""
    codes = {s.get("code") for s in contract.get("suppliers") or [] if s.get("code")}
    surnames = {_surname(s.get("name")) for s in contract.get("suppliers") or [] if len(s.get("code") or "") == 10}
    signed = contract.get("signed")
    today = spending.today()
    # Payments without a contract reference count as "possibly ours" up to 90 days after the term.
    late_limit = (date.fromisoformat(contract["end"]) + timedelta(days=90)).isoformat() if contract.get("end") else None

    # Payments: the whole term on the first run, then a short overlapping window.
    payments = {p["id"]: p for p in (old or {}).get("payments") or []}
    last = (old or {}).get("payments_checked")
    start = (date.fromisoformat(last) - timedelta(days=OVERLAP_DAYS)) if last else (
        date.fromisoformat(signed) - timedelta(days=30) if signed else today - timedelta(days=365))
    for tx in fetch_payments(buyer, codes, start, today + timedelta(days=1)):
        if not _is_supplier(tx, codes, surnames):
            continue
        tid = str(tx.get("id") or tx.get("doc_vob") or "")
        if not tid:
            continue
        sure = _names_contract(tx, contract.get("number"), signed)
        if not sure:
            day = (tx.get("trans_date") or "")[:10]
            if analysis.parse_contract_refs(tx.get("payment_details")):
                continue  # names some other contract
            if (signed and day < signed) or (late_limit and day > late_limit):
                continue  # outside the contract's time: not ours
        payments[tid] = {"id": tid, "date": (tx.get("trans_date") or "")[:10], "amount": float(tx.get("amount") or 0),
                         "purpose": tx.get("payment_details") or "", "kekv": tx.get("kekv") or "", "sure": sure}

    # The Treasury side of the contract (acts, addendums), when it is linked.
    sp = req.get("sp") or contract.get("sp") or ""
    tc = (treasury_by_org.get(req["org"]) or {}).get(sp) if sp else None
    acts = [{"date": a.get("date"), "amount": a.get("amount"), "number": a.get("number")} for a in (tc or {}).get("acts") or []]

    value = (contract.get("value") or {}).get("amount") or (tc or {}).get("value") or 0
    pays = sorted(payments.values(), key=lambda p: (p["date"], p["id"]))
    paid = round(sum(p["amount"] for p in pays if p["sure"]), 2)
    maybe = round(sum(p["amount"] for p in pays if not p["sure"]), 2)
    stages, due_now = schedule(value, signed, tender.get("milestones") or [], acts, today.isoformat())
    snap = {
        "key": key, "org": req["org"], "tid": req["tid"], "tender_id": tender_id, "sp": sp, "note": req.get("note") or "",
        "followers": req.get("followers") or [],
        "added_at": req.get("addedAt") or "",
        "tender": tender, "contract": contract, "payments": pays, "acts": acts,
        "acts_sum": round(sum(a.get("amount") or 0 for a in acts), 2),
        "totals": {"value": value, "paid": paid, "maybe": maybe, "left": round(value - paid, 2),
                   "due_now": due_now, "overdue": round(max(0.0, due_now - paid), 2)},
        "stages": stages,
        "payments_checked": today.isoformat(),
    }
    events = _diff(old, snap)
    snap["history"] = (events + ((old or {}).get("history") or []))[:HISTORY_SIZE]
    snap["changed_at"] = events[0]["at"] if events else (old or {}).get("changed_at")
    log("  %s № %s: сплачено %.2f з %.2f, подій %d" % (req["tid"], contract.get("number") or "—", paid, value, len(events)))
    return snap


def index_row(s):
    c, t = s["contract"], s["tender"]
    sup = (c.get("suppliers") or [{}])[0]
    return {
        "key": s["key"], "org": s["org"], "tid": s["tid"], "sp": s.get("sp") or "",
        "number": c.get("number") or "", "signed": c.get("signed"), "end": c.get("end"), "status": c.get("status"),
        "title": c.get("title") or t.get("title") or "", "buyer": t.get("buyer"), "buyer_name": t.get("buyer_name") or "",
        "supplier": sup.get("code") or "", "supplier_name": sup.get("name") or "",
        "method": t.get("method"), "totals": s["totals"], "changed_at": s.get("changed_at"),
        "last_event": (s.get("history") or [{}])[0], "docs": len(c.get("docs") or []) + len(t.get("docs") or []),
        "note": s.get("note") or "", "added_at": s.get("added_at") or "",
        "followers": s.get("followers") or [],  # Firebase uids; the Drive script copies a user's own
    }
