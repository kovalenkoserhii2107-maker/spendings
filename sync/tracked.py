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
import undp
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
                    # What the analyst's portfolio knows of it: the UNDP sub-project, its EIB programme,
                    # what the procurement buys, and the loan's part paid by Mindev's register.
                    if re.match(r"^[A-Z]{2}\d{1,2}[A-Z]?_\d{2}$", str(t.get("subp") or "")):
                        e["subp"] = t["subp"]
                    if str(t.get("prog") or "") in ("urp", "urp3", "uerp"):
                        e["prog"] = t["prog"]
                    if str(t.get("role") or "") in ("works", "ts", "csc", "author", "design", "other"):
                        e["role"] = t["role"]
                    try:
                        if t.get("eib_paid") is not None and 0 <= float(t["eib_paid"]) < 1e11:
                            e["eib_paid"] = round(float(t["eib_paid"]), 2)
                    except (TypeError, ValueError):
                        pass
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


def _classify(details, contract_number, day, tid, number, signed, late_limit, single):
    """Whose payment this is: "sure" (ours), "maybe" (between the same parties during the
    contract, naming no other one) or None (not ours).

    The Treasury's contractNumber is often the Prozorro procedure id: another procedure's id
    rules the payment out, ours makes it ours when the procedure has one contract with this
    supplier (or the purpose names this contract's number)."""
    cn = analysis.norm_tid(contract_number)
    named = _names_contract({"payment_details": details}, number, signed)
    if cn and tid:
        if cn != analysis.norm_tid(tid):
            return None
        if single or named:
            return "sure"
    if named:
        return "sure"
    if analysis.parse_contract_refs(details):
        return None  # names some other contract
    if (signed and day < signed) or (late_limit and day > late_limit):
        return None  # outside the contract's time: not ours
    return "maybe"


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


def schedule(value, signed, milestones, acts, today, lot=None):
    """Payment stages with the amount each one makes due and, where the event date
    is known, the due date. Post-payment after delivery is due per Treasury act.

    Only the contract's own lot counts in a procedure of several. An advance is the buyer's
    option (it is paid against an invoice and a guarantee), so where the rest is paid by acts it
    is shown with its term but never counted as a debt."""
    stages, due_now = [], 0.0
    fin = [m for m in milestones if m.get("type") == "financing" and (not lot or not m.get("lot") or m.get("lot") == lot)]
    by_acts = any(m.get("code") == "postpayment" for m in fin)
    for m in fin:
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
        if m.get("code") == "prepayment" and by_acts:
            stage["optional"] = True
            stage["due_now"] = 0.0
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
    act_key = lambda a: (a.get("number"), a.get("amount"))  # its date was once the publication date
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
    treasury_only = key.startswith("sp")
    tc_known = None
    if key.startswith("tn"):
        # A procurement on control: once it signs a contract, the same entry follows that
        # contract (payments, acts, documents); until then, the procedure itself.
        tender_id = key[2:]
        tender = prozorro.load_tender(tender_id)
        signed = sorted((c for c in tender.get("contracts") or [] if c.get("status") in ("active", "terminated")),
                        key=lambda c: c.get("signed") or "")
        if not signed:
            return sync_tender(req, old, log, tender)
        contract = signed[0]
        pz_contracts = tender.get("contracts") or []
        tender["other_contracts"] = [{k: c.get(k) for k in ("id", "number", "status", "signed", "value", "suppliers")}
                                     for c in tender.get("contracts") or [] if c.get("id") != contract.get("id")]
        tender.pop("contracts", None)
    elif treasury_only:
        tender_id, (tender, contract, tc_known) = None, _treasury_only(req, old, treasury_by_org, log)
        pz_contracts = []
    else:
        tender_id = (old or {}).get("tender_id") or (tenders_by_org.get(req["org"], {}).get(req["tid"]) or {}).get("id")
        if not tender_id:
            tender_id = prozorro.internal_id(req["tid"])
        tender = prozorro.load_tender(tender_id)
        contract = next((c for c in tender.get("contracts") or [] if c.get("id") == key), None)
        if not contract:
            raise prozorro.ProzorroError("договору %s немає в закупівлі %s" % (key, req["tid"]))
        pz_contracts = tender.get("contracts") or []
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
    # One contract of this supplier in the procedure: the procedure id in a payment is enough.
    single = sum(1 for c in pz_contracts if c.get("status") != "cancelled"
                 and ({x.get("code") for x in c.get("suppliers") or []} & codes or not codes)) <= 1
    whose = lambda details, cn, day: _classify(details, cn, day, req.get("tid") or "", contract.get("number"), signed, late_limit, single)
    # The payments kept from earlier runs are judged again by today's rules.
    for pid, p in list(payments.items()):
        verdict = whose(p.get("purpose") or "", (p.get("tx") or {}).get("contractNumber"), p.get("date") or "")
        if verdict is None:
            del payments[pid]
        else:
            p["sure"] = verdict == "sure"
    for tx in fetch_payments(buyer, codes, start, today + timedelta(days=1)):
        if not _is_supplier(tx, codes, surnames):
            continue
        tid = str(tx.get("id") or tx.get("doc_vob") or "")
        if not tid:
            continue
        verdict = whose(tx.get("payment_details") or "", tx.get("contractNumber"), (tx.get("trans_date") or "")[:10])
        if verdict is None:
            payments.pop(tid, None)
            continue
        sure = verdict == "sure"
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
    acts = [{k: a.get(k) for k in ("date", "published", "amount", "number") if a.get(k) is not None} for a in (tc or {}).get("acts") or []]
    addendums = [{k: a.get(k) for k in ("date", "published", "number", "amount", "type", "delta", "as_delta") if a.get(k) not in (None, "")}
                 for a in (tc or {}).get("addendums") or []]

    value = (contract.get("value") or {}).get("amount") or (tc or {}).get("value") or 0
    pays = sorted(payments.values(), key=lambda p: (p["date"], p["id"]))
    paid = round(sum(p["amount"] for p in pays if p["sure"]), 2)
    maybe = round(sum(p["amount"] for p in pays if not p["sure"]), 2)
    acts_sum = round(sum(a.get("amount") or 0 for a in acts), 2)
    stages, due_now = schedule(value, signed, tender.get("milestones") or [], acts, today.isoformat(), contract.get("lot"))
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
    # A contract of a UNDP sub-project of an EIB programme is EIB-financed, whatever its texts say.
    if not eib_kind and (req.get("prog") or req.get("subp") or req.get("eib_paid") is not None):
        eib_kind = "program"
    # EIB-financed: payments may also go by other routes than the buyer's Treasury account, so
    # what looks overdue is shown as "not seen" rather than as a debt.
    partial = bool(eib_kind)
    # The loan's part, read back from the VAT the buyer paid on it (acts less the buyer's payments).
    eib_paid = compliance.eib_from_vat(pays, acts)
    # Mindev's register says what the loan paid: it wins over the estimate from the VAT.
    if req.get("eib_paid") is not None:
        local = round(sum(p["amount"] for p in pays if p.get("sure")), 2)
        eib_paid = {"local": local, "eib": req["eib_paid"], "total": round(local + req["eib_paid"], 2), "acts": [],
                    "estimated": 0.0, "source": "mindev"}
    if eib_paid:
        overdue = round(max(0.0, due_now - eib_paid["total"]), 2)
    # Payments against the portal's acts and addendums; the advance and its closing by acts.
    pay_sig, pay_notes, doc_audit, advance = compliance.payment_checks(
        pays, acts, addendums, contract.get("changes"), value, today.isoformat(), contract, acts_known=tc is not None,
        docs=list(contract.get("docs") or []))
    # Works: the sub-project code and the buyer's other procurements for the same object
    # (design, technical and author's supervision, expert review).
    works = (tender.get("cpv") or "").startswith("45") or tender.get("category") == "works"
    tender["subproject"] = prozorro.subproject(tender, [contract])
    # The procurement plan: year, amount, funding sources (local, state, loan...), КЕКВ.
    plans = []
    for pid in (tender.get("plans") or [])[:3]:
        try:
            plans.append(prozorro.load_plan(pid))
        except prozorro.ProzorroError as e:
            log("  ! план %s: %s" % (pid, e))
            plans = ((old or {}).get("tender") or {}).get("plan_info") or []
            break
    if plans:
        tender["plan_info"] = plans
    related = (old or {}).get("related")
    if works and tender_id and not treasury_only:
        try:
            related = prozorro.related(tender.get("buyer") or buyer, tender.get("title"), req["tid"])
        except prozorro.ProzorroError as e:
            log("  ! пов'язані закупівлі: %s" % e)
        # Who does the technical supervision and the consulting engineer's job.
        related = prozorro.related_suppliers(related, (old or {}).get("related"), log)
    pay_notes["oversight"] = [["no_supervision", {}]] if works and eib_kind and related is not None \
        and not any(r.get("role") == "supervision" for r in related) else []
    review = compliance.evaluate(tender, contract, eib=bool(eib_kind), paid=paid, acts_sum=acts_sum,
                                 treasury=dict(chk, flags=flags) if tc else None, overdue=0 if (partial and not eib_paid) else overdue, sasu=audit,
                                 extra=(pay_sig, pay_notes))
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
        "totals": {"value": value, "paid": paid, "maybe": maybe, "left": round(value - (eib_paid["total"] if eib_paid else paid), 2),
                   "due_now": due_now, "overdue": overdue, "partial": partial and not eib_paid,
                   "paid_eib": eib_paid["eib"] if eib_paid else None, "paid_total": eib_paid["total"] if eib_paid else None},
        "eib_paid": eib_paid,
        "stages": stages,
        "flags": flags, "signals": signals, "checklist": review["checklist"],
        "doc_audit": doc_audit, "advance": advance, "related": related,
        "eib": eib_kind, "eib_tx": any(p.get("eib_tx") for p in pays),
        "sasu": audit,
        "payments_checked": today.isoformat(),
    }
    snap["kind"] = "treasury" if treasury_only else "contract"
    # What the UNDP working table keeps: course, bidders, AMCU, price, progress, subvention, matrix.
    snap["undp"] = undp.card(tender, contract, tc, signals, snap["totals"], acts_sum if tc is not None else None, (eib_paid or {}).get("total") or paid,
                             audit, advance, key, today.isoformat(), acts=acts if tc is not None else None, eib_paid=eib_paid,
                             related=related)
    if key.startswith("tn"):
        snap.update(contract_id=contract.get("id"), from_tender=True)
    if old and old.get("kind") == "tender":
        # The procurement has just signed its contract: one event, not every document and payment.
        sup = (contract.get("suppliers") or [{}])[0]
        events = [_event("stage_contract", number=contract.get("number") or "", amount=value, supplier=sup.get("name") or "")]
    else:
        events = _diff(old, snap)
        if old:
            events += undp.events(old.get("undp"), snap["undp"], _event) + undp.sasu_events(old.get("sasu"), audit, _event)
    snap["history"] = (events + ((old or {}).get("history") or []))[:HISTORY_SIZE]
    snap["changed_at"] = events[0]["at"] if events else (old or {}).get("changed_at")
    log("  %s № %s: сплачено %.2f з %.2f, подій %d" % (req["tid"], contract.get("number") or "—", paid, value, len(events)))
    return snap


def sync_tender(req, old, log=print, tender=None):
    """A procurement on control before (or while) it gets contracts: its course, bidders,
    complaints, documents and the State Audit Service; each contract it signs can then be
    taken on control by itself."""
    key, tender_id = req["key"], req["key"][2:]
    tender = tender or prozorro.load_tender(tender_id)
    try:
        audit = sasu.monitorings(tender_id, req["tid"])
    except prozorro.ProzorroError as e:
        log("  ! Держаудитслужба: %s" % e)
        audit = (old or {}).get("sasu") or []
    # As for a contract: the sub-project code, the procurement plan, the buyer's other procurements
    # for the same object (supervision, design) — known before any contract is signed.
    tender["subproject"] = prozorro.subproject(tender)
    plans = []
    for pid in (tender.get("plans") or [])[:3]:
        try:
            plans.append(prozorro.load_plan(pid))
        except prozorro.ProzorroError as e:
            log("  ! план %s: %s" % (pid, e))
            plans = ((old or {}).get("tender") or {}).get("plan_info") or []
            break
    if plans:
        tender["plan_info"] = plans
    related = (old or {}).get("related")
    if (tender.get("cpv") or "").startswith("45") or tender.get("category") == "works":
        try:
            related = prozorro.related(tender.get("buyer") or req["org"], tender.get("title"), tender.get("tid") or req["tid"])
            related = prozorro.related_suppliers(related, (old or {}).get("related"), log)
        except prozorro.ProzorroError as e:
            log("  ! пов'язані закупівлі: %s" % e)
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
        "eib": eib_kind, "eib_tx": False, "sasu": audit, "related": related,
        "payments_checked": spending.today().isoformat(),
    }
    snap["undp"] = undp.card(tender, None, None, signals, snap["totals"], 0, 0, audit, None, key, spending.today().isoformat(),
                             contract_stage=False, related=related)
    events = _diff(old, snap)
    if old:
        events += undp.events(old.get("undp"), snap["undp"], _event) + undp.sasu_events(old.get("sasu"), audit, _event)
        known = {c.get("id") for c in (old.get("tender") or {}).get("contracts") or []}
        for c in tender.get("contracts") or []:
            if c.get("id") not in known:
                events.append(_event("contract_new", id=c.get("id"), number=c.get("number") or "", amount=(c.get("value") or {}).get("amount"),
                                     supplier=((c.get("suppliers") or [{}])[0]).get("name") or ""))
    snap["history"] = (events + ((old or {}).get("history") or []))[:HISTORY_SIZE]
    snap["changed_at"] = events[0]["at"] if events else (old or {}).get("changed_at")
    log("  %s (закупівля): %s, договорів %d, подій %d" % (snap["tid"], tender.get("status"), len(tender.get("contracts") or []), len(events)))
    return snap


def stamp_signals(snap, old, now):
    """When each signal first showed. Those there when the contract was taken on control (or, for
    contracts kept before this was recorded, on the first run since) are the starting state, seen in
    the dossier but not news; one that goes away and comes back is new again."""
    prev = (old or {}).get("signal_seen")
    seen = {}
    for x in snap.get("signals") or []:
        k = x.get("type") or ""
        if k in seen:
            continue
        seen[k] = {"at": now, "base": True} if prev is None else (prev.get(k) or {"at": now})
    snap["signal_seen"] = seen


def index_row(s):
    c, t = s["contract"] or {}, s["tender"]
    sup = (c.get("suppliers") or [{}])[0]
    return {
        "key": s["key"], "kind": s.get("kind") or ("treasury" if s["key"].startswith("sp") else "contract"),
        "from_tender": bool(s.get("from_tender")),
        "org": s["org"], "tid": s["tid"], "sp": s.get("sp") or "", "tender_status": t.get("status") or "",
        "contract_id": s.get("contract_id") or c.get("id"),
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
        "signals": [dict({k: x.get(k) for k in ("type", "severity", "params", "amount")},
                         since=((s.get("signal_seen") or {}).get(x.get("type")) or {}).get("at"),
                         base=bool(((s.get("signal_seen") or {}).get(x.get("type")) or {}).get("base")))
                    for x in s.get("signals") or []],
        "sasu": sasu.summary(s.get("sasu")),
        "checks": {x["key"]: x["status"] for x in s.get("checklist") or []},
        "viewers": s.get("viewers") or [],  # hashes; the Drive script copies the contracts it sees itself in
        "owners": s.get("owners") or [],
        # For sorting and grouping the list: risk, sub-project, programme, region, progress, dates.
        **_list_fields(s),
    }


def _list_fields(s):
    u, t = s.get("undp") or {}, s.get("tender") or {}
    mx, pg, tl, sv, cp = u.get("matrix") or {}, u.get("progress") or {}, u.get("timeline") or {}, u.get("subvention") or {}, u.get("complaints") or {}
    fd = u.get("funding") or {}
    tt = s.get("totals") or {}
    alerts = []
    if mx.get("overall") == 3:
        alerts.append("risk")
    if any(m.get("violation") for m in s.get("sasu") or []):
        alerts.append("sasu")
    if sum((cp.get(of) or {}).get("open", 0) for of in ("tender", "award")):
        alerts.append("amcu")
    if (tt.get("overdue") or 0) > 1 and not tt.get("partial"):
        alerts.append("overdue")
    if pg.get("overdue_days"):
        alerts.append("late")
    if any(f.get("level") == "high" for f in (u.get("legal") or {}).get("flags") or []):
        alerts.append("legal")
    if any(f.get("level") == "high" for f in u.get("collusion") or []):
        alerts.append("collusion")
    rl = u.get("rules")
    if any(x.get("st") == "bad" and x.get("level") == "high" for x in ((rl.get("items") if isinstance(rl, dict) else rl) or [])):
        alerts.append("rules")
    if any(str(w).startswith("subvention_") or w == "funding_gap" for w in (mx.get("why") or {}).get("r3") or []):
        alerts.append("subvention")
    return {k: v for k, v in {
        "risk": mx.get("overall"), "subproject": (t.get("subproject") or {}).get("code"),
        # The price from the award to now, for the contract card (start → now, %).
        "price": {k: (u.get("price") or {}).get(k) for k in ("first", "now", "change_pct") if (u.get("price") or {}).get(k) is not None} or None,
        # The ratings with their reasons: hints to the sub-project's own matrix.
        "matrix": {"scores": {k: v for k, v in (mx.get("scores") or {}).items() if v is not None}, "why": mx.get("why") or {}} if mx else None,
        "programme": sv.get("programme"), "region": t.get("region"),
        "acts_pct": pg.get("acts_pct"), "paid_pct": pg.get("paid_pct"), "late_days": pg.get("overdue_days"),
        "opening": tl.get("opening") if s.get("kind") == "tender" else None, "auction": tl.get("auction") if s.get("kind") == "tender" else None,
        "alerts": alerts,
        "funding": {k: fd.get(k) for k in ("status", "need", "gap", "left", "year_subvention", "remaining", "eib_paid_year") if fd.get(k) is not None} or None,
        # The programme rules in short, for the portfolio summary: what is broken, how much to look at.
        "rules": {"ed": rl.get("edition"), "prog": rl.get("programme"), "strict": rl.get("strict"),
                  "bad": [x["key"] for x in rl.get("items") or [] if x.get("st") == "bad"],
                  "look": sum(1 for x in rl.get("items") or [] if x.get("st") == "check" and x.get("level") != "low")} if isinstance(rl, dict) else None,
    }.items() if v not in (None, "", [])}
