"""Contracts on control: the ones an analyst picked in the app.

A user takes a Prozorro contract "on control" in the app; its id reaches the sync
through the anonymous public lists pub/{hash}. Every run this module re-reads
each contract in full and writes:

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
import compliance
import eib
import prozorro
import sasu
import spending

PUB_URL = ("https://firestore.googleapis.com/v1/projects/spending-monitor-2122b/"
           "databases/(default)/documents/pub?pageSize=300")
# A Prozorro contract id; "sp" + a Treasury id (no such contract in Prozorro);
# "tn" + a Prozorro procedure id (a procurement on control before it has a contract).
KEY_RE = re.compile(r"^([0-9a-f]{32}|sp[0-9]{3,20}|tn[0-9a-f]{32})$")
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
OVERLAP_DAYS = 7
HISTORY_SIZE = 300
# The Treasury record of a payment as the app's payment card shows it.
TX_FIELDS = ("trans_date", "payer_name", "payer_edrpou", "payer_account", "recipt_name", "recipt_edrpou", "recipt_account",
             "payment_details", "doc_number", "doc_date", "kekv", "kpk", "budgetCode", "source_name", "contractNumber", "currency")
EVENTS_IN_INDEX = 15  # recent events per contract, for the app's feed of changes


def _val(v):
    """A Firestore REST value as plain Python."""
    if "stringValue" in v:
        return v["stringValue"]
    if "arrayValue" in v:
        return [_val(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v:
        return {k: _val(x) for k, x in v["mapValue"].get("fields", {}).items()}
    return next(iter(v.values()), None)


def read_pub():
    """What users follow, from the public, anonymous lists pub/{sha256("monitor:" + uid)}.

    Each user's own lists (names, notes, e-mails) are private; the app copies only
    organisation codes and contract ids here, under a hash nobody can map back to a
    person. Returns (orgs, contracts):
      orgs      {edrpou: {"role", "owners": set of hashes}}
      contracts {contract id: {"org", "tid", "sp", "owners": set, "viewers": set}}
    where viewers are the owners plus everyone the contract was shared with.
    """
    orgs, contracts, shares, url = {}, {}, [], PUB_URL
    while url:
        req = urllib.request.Request(url, headers={"User-Agent": "spending-monitor-sync"})
        with urllib.request.urlopen(req, context=spending._ctx, timeout=30) as res:
            page = json.loads(res.read().decode("utf-8"))
        for doc in page.get("documents", []):
            h = doc["name"].rsplit("/", 1)[-1]
            if not HASH_RE.match(h):
                continue
            f = {k: _val(v) for k, v in doc.get("fields", {}).items()}
            for o in f.get("orgs") or []:
                code = str((o or {}).get("edrpou") or "")
                if re.match(r"^(\d{8}|\d{10})$", code):
                    e = orgs.setdefault(code, {"role": "supplier" if o.get("role") == "supplier" else "buyer", "owners": set()})
                    e["owners"].add(h)
            for t in f.get("tracked") or []:
                cid = str((t or {}).get("cid") or "")
                treasury_only = cid.startswith("sp")
                if KEY_RE.match(cid) and (treasury_only or str(t.get("tid") or "").startswith("UA-")):
                    e = contracts.setdefault(cid, {"key": cid, "org": str(t.get("org") or ""), "tid": "" if treasury_only else t["tid"],
                                                   "sp": cid[2:] if treasury_only else str(t.get("sp") or ""),
                                                   "date": str(t.get("date") or "")[:10], "owners": set(), "viewers": set()})
                    e["owners"].add(h)
                    e["viewers"].add(h)
            for sh in f.get("shares") or []:
                if KEY_RE.match(str((sh or {}).get("cid") or "")) and HASH_RE.match(str(sh.get("to") or "")):
                    shares.append((h, sh["cid"], sh["to"]))
        token = page.get("nextPageToken")
        url = PUB_URL + "&pageToken=" + token if token else None
    for owner, cid, to in shares:
        if cid in contracts and owner in contracts[cid]["owners"]:  # only an owner's share counts
            contracts[cid]["viewers"].add(to)
    return orgs, contracts


def requests_from_app():
    """Contracts on control: [{"key", "org", "tid", "sp", "viewers": [hashes]}]."""
    return [dict(c, owners=sorted(c["owners"]), viewers=sorted(c["viewers"])) for c in read_pub()[1].values()]


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
    def docs(snap):
        out = {}
        for of in ("contract", "tender"):
            for d in (snap.get(of) or {}).get("docs") or []:
                out[d.get("id") or d.get("url")] = (of, d)
        return out
    old_docs = {k: d.get("date") for k, (_, d) in docs(old).items()}
    for k, (of, d) in docs(new).items():
        if k not in old_docs or (d.get("date") and old_docs[k] and d.get("date") != old_docs[k]):
            ev.append(_event("doc", id=d.get("id") or "", title=d.get("title"), doc_type=d.get("type"), of=of,
                             date=(d.get("date") or "")[:10], updated=k in old_docs))
    old_pay = {p["id"] for p in old.get("payments") or []}
    for p in new.get("payments") or []:
        if p["id"] not in old_pay:
            ev.append(_event("payment", date=p["date"], amount=p["amount"], sure=p["sure"], purpose=(p.get("purpose") or "")[:160]))
    act_key = lambda a: (a.get("number"), a.get("date"), a.get("amount"))
    old_acts = {act_key(a) for a in old.get("acts") or []}
    for a in new.get("acts") or []:
        if act_key(a) not in old_acts:
            ev.append(_event("act", number=a.get("number"), date=a.get("date"), amount=a.get("amount")))
    od, nd = (old.get("totals") or {}).get("due_now") or 0, (new.get("totals") or {}).get("due_now") or 0
    if nd > od + 1:
        ev.append(_event("due", amount=round(nd - od, 2), overdue=(new.get("totals") or {}).get("overdue") or 0))
    ots, nts = (old.get("tender") or {}).get("status"), (new.get("tender") or {}).get("status")
    if ots != nts:
        ev.append(_event("tender_status", old=ots, new=nts))
    return ev


def treasury_contract(buyer, contract, tid, sp, log=print):
    """The Treasury record of one Prozorro contract, with its acts and addendums, asked
    from spending.gov.ua directly (for a buyer that is not monitored as a whole).

    Paired as prozorro.link() does: the supplier always matches; then the record names
    the tender (and the number matches), or the number matches within 31 days, or the
    price does. Returns analysis' contract row or None.
    """
    signed = contract.get("signed")
    if not buyer or not signed:
        return None
    start = date.fromisoformat(signed) - timedelta(days=30)
    end = spending.today() + timedelta(days=1)
    docs, _ = spending.fetch_documents("contract", buyer, "disposer", start, end)
    rows = []
    for d in docs:
        first = (d.get("contractors") or [{}])[0]
        rows.append({"id": str(d.get("id")), "number": d.get("documentNumber") or "", "date": (d.get("documentDate") or "")[:10],
                     "party_code": first.get("identifier") if first.get("identifier") != "HIDDEN" else None,
                     "party_name": first.get("name") or "", "prozorro": d.get("idTenderProzorro") or "",
                     "value0": float(d.get("amount") or 0), "raw": d})
    codes = {s.get("code") for s in contract.get("suppliers") or [] if s.get("code")}
    names = [s.get("name") for s in contract.get("suppliers") or [] if len(s.get("code") or "") == 10]
    num = prozorro._norm_number(contract.get("number"))
    amount = (contract.get("value") or {}).get("amount")
    hit = next((r for r in rows if sp and r["id"] == str(sp)), None)
    for rule in (1, 2, 3, 4):
        if hit:
            break
        for r in rows:
            party = prozorro._same_supplier(r, codes, names)
            near = prozorro._days_apart(r["date"], signed) <= 31
            same_num = bool(num) and prozorro._norm_number(r["number"]) == num
            if (rule == 1 and party and r["prozorro"] == tid and same_num
                    or rule == 2 and party and r["prozorro"] == tid
                    or rule == 3 and party and same_num and near
                    or rule == 4 and party and near and amount is not None and abs(r["value0"] - amount) < 1):
                hit = r
                break
    if not hit:
        log("  Казначейство: договір № %s не знайдено серед %d договорів замовника" % (contract.get("number") or "—", len(rows)))
        return None
    items = [{"kind": "contract", "data": hit["raw"], "role": "disposer", "ext_id": hit["id"], "cp_name": None}]
    for kind in ("act", "addendum"):
        found, _ = spending.fetch_documents(kind, buyer, "disposer", start, end)
        items += [{"kind": kind, "data": d, "role": "disposer", "ext_id": str(d.get("id"))}
                  for d in found if str(d.get("parentId")) == hit["id"]]
    row = next(c for c in analysis.analyze(items, buyer)["contracts"] if c["id"] == hit["id"])
    log("  Казначейство: договір %s, актів %d, додаткових угод %d" % (hit["id"], len(row["acts"]), len(row["addendums"])))
    return row


def _treasury_only(req, old, treasury_by_org, log):
    """A contract Prozorro does not have: the Treasury record stands in for both the
    procurement and the contract. Returns (tender, contract, Treasury row)."""
    buyer, sp = req["org"], req["sp"]
    tc = (treasury_by_org.get(buyer) or {}).get(sp)
    if tc is None:
        signed = (old or {}).get("contract", {}).get("signed") or req.get("date")
        if not signed:
            raise spending.ApiError("невідома дата договору %s" % sp)
        tc = treasury_contract(buyer, {"signed": signed, "suppliers": []}, "", sp, log)
        if tc is None:
            raise spending.ApiError("договору %s немає в Казначействі" % sp)
    buyer_name = (old or {}).get("tender", {}).get("buyer_name") or ""
    if not buyer_name:
        try:
            buyer_name = (spending.fetch_card(buyer) or {}).get("orgName") or ""
        except spending.ApiError:
            pass
    supplier = {"name": tc.get("party_name") or "", "code": tc.get("party_code") or ""}
    contract = {"id": req["key"], "number": tc.get("number") or "", "title": tc.get("subject") or "", "status": "active",
                "signed": tc.get("date"), "start": tc.get("from"), "end": tc.get("to"),
                "value": {"amount": tc.get("value"), "currency": tc.get("currency") or "UAH"},
                "suppliers": [supplier], "docs": [], "changes": [], "sp": sp}
    tender = {"title": tc.get("subject") or "", "buyer": buyer, "buyer_name": buyer_name, "method": "", "status": "",
              "cpv": tc.get("cpv") or "", "docs": [], "milestones": [], "treasury_only": True}
    return tender, contract, tc


def sync_one(req, old, tenders_by_org, treasury_by_org, log=print):
    """Fresh snapshot of one contract on control (old = the previous one or None)."""
    key = req["key"]
    if key.startswith("tn"):
        return sync_tender(req, old, log)
    treasury_only = key.startswith("sp")
    tc_known = None
    if treasury_only:
        tender_id, (tender, contract, tc_known) = None, _treasury_only(req, old, treasury_by_org, log)
    else:
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
    # Sole traders: a 10-digit code, or none at all where the Treasury masks it.
    surnames = {_surname(s.get("name")) for s in contract.get("suppliers") or [] if len(s.get("code") or "") != 8}
    signed = contract.get("signed")
    today = spending.today()
    # Payments without a contract reference count as "possibly ours" up to 90 days after the term.
    late_limit = (date.fromisoformat(contract["end"]) + timedelta(days=90)).isoformat() if contract.get("end") else None

    # Payments: the whole term on the first run, then a short overlapping window.
    payments = {p["id"]: p for p in (old or {}).get("payments") or []}
    last = (old or {}).get("payments_checked")
    if any("tx" not in p for p in payments.values()):
        last = None  # earlier snapshots kept no full payment record: read the whole term once
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
                         "purpose": tx.get("payment_details") or "", "kekv": tx.get("kekv") or "", "sure": sure,
                         "tx": {k: tx.get(k) for k in TX_FIELDS if tx.get(k) not in (None, "")}}
        if analysis.EIB_TX.search(tx.get("payment_details") or ""):
            payments[tid]["eib_tx"] = True

    # The Treasury side of the contract (acts, addendums): from the organisation's own data when
    # the buyer is monitored, otherwise asked from the Treasury for this one contract.
    sp = req.get("sp") or contract.get("sp") or (old or {}).get("sp") or ""
    tc = tc_known or ((treasury_by_org.get(req["org"]) or {}).get(sp) if sp else None)
    if tc is None and not treasury_only:
        try:
            tc = treasury_contract(buyer, contract, req["tid"], sp, log)
        except spending.ApiError as e:
            log("  ! Казначейство: %s" % e)
    sp = (tc or {}).get("id") or sp
    acts = [{"date": a.get("date"), "amount": a.get("amount"), "number": a.get("number")} for a in (tc or {}).get("acts") or []]
    addendums = [{k: a.get(k) for k in ("date", "number", "amount", "type", "delta", "as_delta") if a.get(k) not in (None, "")}
                 for a in (tc or {}).get("addendums") or []]

    value = (contract.get("value") or {}).get("amount") or (tc or {}).get("value") or 0
    pays = sorted(payments.values(), key=lambda p: (p["date"], p["id"]))
    paid = round(sum(p["amount"] for p in pays if p["sure"]), 2)
    maybe = round(sum(p["amount"] for p in pays if not p["sure"]), 2)
    acts_sum = round(sum(a.get("amount") or 0 for a in acts), 2)
    stages, due_now = schedule(value, signed, tender.get("milestones") or [], acts, today.isoformat())
    overdue = round(max(0.0, due_now - paid), 2)

    # Flags and signals: the Treasury checks with this contract's own payments, then the
    # procurement checks (competition, documents, EIB covenants, complaints, State Audit).
    chk = dict(tc or {"id": sp or key, "value0": value, "price_up": 0.0, "addendums": [], "role": "disposer",
                      "tender": True, "prozorro": req["tid"], "date": signed, "published": None, "cpv": tender.get("cpv") or ""},
               value=(tc or {}).get("value") or value, paid=paid, acts_sum=acts_sum,
               payments=[{"ext_id": p["id"], "date": p["date"], "amount": p["amount"]} for p in pays if p["sure"]])
    flags, signals = analysis.contract_checks(chk)
    if "late" in flags:  # an organisation's report sums this up; here it is about this one contract
        signals.append(analysis._signal("late", "low", {"n": 1, "total": 1, "median": chk.get("late_days") or 0}, chk))
    if tc:
        mm = analysis.pz_mismatch(chk, (contract.get("value") or {}).get("amount"))
        if mm:
            flags.append("pz_treasury_mismatch")
            signals.append(mm)
    try:
        audit = sasu.monitorings(tender_id, req["tid"]) if tender_id else []
    except prozorro.ProzorroError as e:
        log("  ! Держаудитслужба: %s" % e)
        audit = (old or {}).get("sasu") or []
    eib_kind = eib.classify(dict(tender, contracts=[contract]))
    review = compliance.evaluate(tender, contract, eib=bool(eib_kind), paid=paid, acts_sum=acts_sum,
                                 treasury=dict(chk, flags=flags) if tc else None, overdue=overdue, sasu=audit)
    if treasury_only:  # no procurement in Prozorro: nothing to say about it
        review["signals"] = [x for x in review["signals"] if x["type"] not in ("single_bidder", "unanswered_questions")]
        for item in review["checklist"]:
            if item["key"] in ("competition", "documents", "oversight"):
                item.update(status="na", notes=[["no_prozorro", {}]])
    signals += review["signals"]
    flags += [x["type"] for x in review["signals"] if x["type"] not in flags]
    signals.sort(key=lambda x: (analysis.SEVERITY_ORDER[x["severity"]], -(x.get("amount") or 0)))

    snap = {
        "key": key, "org": req["org"], "tid": req["tid"], "tender_id": tender_id, "sp": sp,
        "viewers": req.get("viewers") or [],  # sha256("monitor:" + uid) of owners and recipients
        "owners": req.get("owners") or [],    # of those, who has it on control (the rest got it shared)
        "tender": tender, "contract": contract, "payments": pays, "acts": acts, "addendums": addendums,
        "acts_sum": acts_sum,
        "treasury": {k: (tc or {}).get(k) for k in ("id", "number", "date", "value0", "value", "price_up", "published", "late_days")} if tc else None,
        "totals": {"value": value, "paid": paid, "maybe": maybe, "left": round(value - paid, 2),
                   "due_now": due_now, "overdue": overdue},
        "stages": stages,
        "flags": flags, "signals": signals, "checklist": review["checklist"],
        "eib": eib_kind, "eib_tx": any(p.get("eib_tx") for p in pays),
        "sasu": audit,
        "payments_checked": today.isoformat(),
    }
    events = _diff(old, snap)
    snap["history"] = (events + ((old or {}).get("history") or []))[:HISTORY_SIZE]
    snap["changed_at"] = events[0]["at"] if events else (old or {}).get("changed_at")
    log("  %s № %s: сплачено %.2f з %.2f, подій %d" % (req["tid"], contract.get("number") or "—", paid, value, len(events)))
    return snap


def sync_tender(req, old, log=print):
    """A procurement on control before (or while) it gets contracts: its course, bidders,
    complaints, documents and the State Audit Service; each contract it signs can then be
    taken on control by itself."""
    key, tender_id = req["key"], req["key"][2:]
    tender = prozorro.load_tender(tender_id)
    try:
        audit = sasu.monitorings(tender_id, req["tid"])
    except prozorro.ProzorroError as e:
        log("  ! Держаудитслужба: %s" % e)
        audit = (old or {}).get("sasu") or []
    eib_kind = eib.classify(tender)
    signals, checklist = [], []
    for c in tender.get("contracts") or [{}]:
        review = compliance.evaluate(tender, c, eib=bool(eib_kind), sasu=audit)
        signals += [x for x in review["signals"] if x not in signals]
        checklist = checklist or review["checklist"]
    for item in checklist:
        if item["key"] in ("price", "reconciliation") or (item["key"] == "documents" and not tender.get("contracts")):
            item.update(status="na", notes=[])
    value = (tender.get("value") or {}).get("amount") or 0
    snap = {
        "key": key, "kind": "tender", "org": req["org"] or tender.get("buyer") or "", "tid": tender.get("tid") or req["tid"],
        "tender_id": tender_id, "sp": "",
        "viewers": req.get("viewers") or [], "owners": req.get("owners") or [],
        "tender": tender, "contract": {}, "payments": [], "acts": [], "addendums": [], "acts_sum": 0,
        "treasury": None,
        "totals": {"value": value, "paid": 0, "maybe": 0, "left": value, "due_now": 0, "overdue": 0},
        "stages": [], "flags": [x["type"] for x in signals], "signals": signals, "checklist": checklist,
        "eib": eib_kind, "eib_tx": False, "sasu": audit,
        "payments_checked": spending.today().isoformat(),
    }
    events = _diff(old, snap)
    if old:
        known = {c.get("id") for c in (old.get("tender") or {}).get("contracts") or []}
        for c in tender.get("contracts") or []:
            if c.get("id") not in known:
                events.append(_event("contract_new", id=c.get("id"), number=c.get("number") or "", amount=(c.get("value") or {}).get("amount"),
                                     supplier=((c.get("suppliers") or [{}])[0]).get("name") or ""))
    snap["history"] = (events + ((old or {}).get("history") or []))[:HISTORY_SIZE]
    snap["changed_at"] = events[0]["at"] if events else (old or {}).get("changed_at")
    log("  %s (закупівля): %s, договорів %d, подій %d" % (snap["tid"], tender.get("status"), len(tender.get("contracts") or []), len(events)))
    return snap


def index_row(s):
    c, t = s["contract"] or {}, s["tender"]
    sup = (c.get("suppliers") or [{}])[0]
    return {
        "key": s["key"], "kind": s.get("kind") or ("treasury" if s["key"].startswith("sp") else "contract"),
        "org": s["org"], "tid": s["tid"], "sp": s.get("sp") or "", "tender_status": t.get("status") or "",
        "contracts_n": len(t.get("contracts") or []) if s.get("kind") == "tender" else None,
        "number": c.get("number") or "", "signed": c.get("signed"), "end": c.get("end"), "status": c.get("status"),
        "title": c.get("title") or t.get("title") or "", "buyer": t.get("buyer"), "buyer_name": t.get("buyer_name") or "",
        "supplier": sup.get("code") or "", "supplier_name": sup.get("name") or "",
        "method": t.get("method"), "totals": s["totals"], "changed_at": s.get("changed_at"),
        "last_event": (s.get("history") or [{}])[0], "docs": len(c.get("docs") or []) + len(t.get("docs") or []),
        "events": [e for e in s.get("history") or [] if e.get("type") != "tracked"][:EVENTS_IN_INDEX],
        "eib": s.get("eib") or ("funder" if any(f.get("code") == "33000" for f in t.get("funders") or []) else ""),
        "eib_tx": bool(s.get("eib_tx")),
        "flags": s.get("flags") or [],
        "signals": [{k: x.get(k) for k in ("type", "severity", "params", "amount")} for x in s.get("signals") or []],
        "sasu": sasu.summary(s.get("sasu")),
        "checks": {x["key"]: x["status"] for x in s.get("checklist") or []},
        "viewers": s.get("viewers") or [],  # hashes; the Drive script copies the contracts it sees itself in
        "owners": s.get("owners") or [],
    }
