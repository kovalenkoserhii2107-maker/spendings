"""Compliance checks of a Prozorro contract for EIB-financed and UNDP-monitored projects.

Signals point at what to check, not at violations. Sources:
  - EIB Guide to Procurement (competition, Annex 3 covenant of integrity, bid and
    advance-payment guarantees) and the EIB Group Anti-Fraud Policy (beneficial owners);
  - UNDP POPP (best value for money, bid security);
  - Cabinet of Ministers Resolution No. 1178 (transparent construction: estimates and
    КБ-2в / КБ-3 acts for works);
  - Law No. 922-VIII on public procurement (price increase within 10%).

`evaluate()` returns the signals and a six-point checklist the app shows in a
contract's card and puts into the Google Drive report.
"""
import re
from datetime import date, timedelta

COMPETITIVE = {"aboveThreshold", "aboveThresholdUA", "aboveThresholdEU", "competitiveDialogueUA",
               "competitiveDialogueEU", "esco", "closeFrameworkAgreementUA", "belowThreshold", "simple.defense", "priceQuotation"}
OPEN_COMPLAINT = {"draft", "claim", "answered", "pending", "accepted"}
EXTENSIONS = {"durationExtension", "fiscalYearExtension"}
ESTIMATE = re.compile(r"(кб\s*-?\s*2|кб\s*-?\s*3|кошторис|\bакт|відомість ресурсів|bill\s+of\s+quantit)", re.I)
INTEGRITY = re.compile(r"(доброчесн|integrity|covenant|пакт)", re.I)
GUARANTEE = re.compile(r"(гаранті|guarantee)", re.I)
UBO = re.compile(r"(кбв|бенефіціар|beneficial)", re.I)
PRICE_UP_LIMIT = 0.10


def _sig(kind, severity, params, pc, amount=None):
    return {"type": kind, "severity": severity, "params": params, "contract": (pc or {}).get("id"),
            "date": (pc or {}).get("signed"), "party": ((pc or {}).get("suppliers") or [{}])[0].get("name"), "amount": amount, "ext_ids": []}


def _docs(t, pc):
    return list((pc or {}).get("docs") or []) + list(t.get("docs") or [])


def _has(docs, rx=None, types=()):
    return any((d.get("type") in types) or (rx and rx.search(d.get("title") or "")) for d in docs)


def _winner(t, pc):
    """The winning price of this contract's lot: its active award, or the contract price."""
    for a in t.get("awards") or []:
        if a.get("status") == "active" and (not pc.get("lot") or not a.get("lot") or a.get("lot") == pc.get("lot")) \
                and (not pc.get("suppliers") or a.get("supplier_code") == pc["suppliers"][0].get("code")):
            return a.get("amount")
    return (pc.get("value") or {}).get("amount")


def _prepayment(t):
    return sum(m.get("pct") or 0 for m in t.get("milestones") or [] if m.get("type") == "financing" and m.get("code") == "prepayment")


def evaluate(t, pc, eib=False, paid=None, acts_sum=None, treasury=None, overdue=None, sasu=None, extra=None):
    """Signals and checklist of one contract `pc` of procedure `t` (both compacted).

    paid / acts_sum come from the Treasury (payments and acts under the contract);
    treasury is its reconciled row (value0, price_up, flags) when one is linked; extra =
    (signals, {checklist key: notes}) of the checks made elsewhere (payment_checks).
    """
    signals, notes = [], {k: [] for k in ("competition", "documents", "guarantees", "price", "reconciliation", "oversight")}
    value = (pc.get("value") or {}).get("amount") or 0
    docs = _docs(t, pc)
    pdocs = list(pc.get("docs") or [])
    lot = pc.get("lot")

    # 1. Competition: a cheaper offer rejected; a competitive procedure with one bid.
    win = _winner(t, pc)
    cheaper = [a for a in t.get("awards") or [] if a.get("status") == "unsuccessful" and a.get("amount") is not None
               and win and a["amount"] < win - 1 and (not lot or not a.get("lot") or a.get("lot") == lot)]
    if cheaper:
        low = min(a["amount"] for a in cheaper)
        signals.append(_sig("disqualified_lower_bid", "high", {"n": len(cheaper), "min": low, "winner": win}, pc, round(win - low, 2)))
        notes["competition"].append(["disqualified_lower_bid", {"n": len(cheaper)}])
    method = t.get("method") or ""
    signed = pc.get("status") in ("active", "terminated")
    if method in COMPETITIVE and t.get("bids") == 1 and signed:
        signals.append(_sig("single_bidder", "medium", {"method": method}, pc))
        notes["competition"].append(["single_bidder", {}])
    if method not in COMPETITIVE:
        notes["competition"].append(["not_competitive", {"method": method}])

    # 2. Documents: the signed contract; for works with progress, the estimate and КБ-2в / КБ-3.
    works = (t.get("cpv") or "").startswith("45") or t.get("category") == "works"
    progress = bool(acts_sum) or (paid or 0) > value * _prepayment(t) / 100.0 + 1
    if not pdocs:
        notes["documents"].append(["no_contract_docs", {}])
    if works and progress and not _has(pdocs, ESTIMATE, ("billOfQuantity",)):
        signals.append(_sig("missing_kb2v", "high", {"paid": paid or 0, "acts": acts_sum or 0}, pc))
        notes["documents"].append(["missing_kb2v", {}])

    # 3. Guarantees and beneficial owners; the EIB covenant of integrity.
    missing = []
    if eib:
        if not _has(docs, INTEGRITY):
            missing.append("integrity")
        if _prepayment(t) and not _has(docs, GUARANTEE, ("contractGuarantees",)):
            missing.append("guarantee")
        if not _has(docs, UBO):
            missing.append("ubo")
        if missing:
            signals.append(_sig("missing_eib_covenants", "medium", {"missing": missing}, pc))
    elif _prepayment(t) and not _has(docs, GUARANTEE, ("contractGuarantees",)):
        missing.append("guarantee")
    for m in missing:
        notes["guarantees"].append(["missing_" + m, {}])

    # 4. Price within 10% and the payment schedule; extensions without progress.
    tr = treasury or {}
    if tr.get("price_up") and tr.get("value0") and tr["price_up"] / tr["value0"] > PRICE_UP_LIMIT:
        notes["price"].append(["price_up", {"pct": round(tr["price_up"] / tr["value0"] * 100, 1)}])
    if overdue and overdue > 1:
        notes["price"].append(["overdue", {"sum": overdue}])
    ext = sum(1 for ch in pc.get("changes") or [] if EXTENSIONS & set(ch.get("types") or []))
    if ext >= 3 and value and (paid or 0) < value * 0.5:
        signals.append(_sig("chain_extensions", "medium", {"n": ext, "pct": round((paid or 0) / value * 100)}, pc))
        notes["price"].append(["chain_extensions", {"n": ext}])

    # 5. Prozorro and the Treasury agree: no overpayment, nothing paid over acts.
    flags = set(tr.get("flags") or [])
    for f in ("overpaid", "paid_over_acts", "pz_treasury_mismatch", "paid_before"):
        if f in flags:
            notes["reconciliation"].append([f, {}])
    if value and paid and paid > value + max(1.0, value * 0.001) and "overpaid" not in flags:
        notes["reconciliation"].append(["overpaid", {}])
    if treasury is None:
        notes["reconciliation"].append(["no_treasury", {}])

    # 6. Complaints, open questions, the State Audit Service.
    open_complaints = [c for c in t.get("complaints") or [] if c.get("status") in OPEN_COMPLAINT]
    if (t.get("questions_unanswered") or 0) > 0 or open_complaints:
        signals.append(_sig("unanswered_questions", "low", {"questions": t.get("questions_unanswered") or 0, "complaints": len(open_complaints)}, pc))
        notes["oversight"].append(["unanswered_questions", {"questions": t.get("questions_unanswered") or 0, "complaints": len(open_complaints)}])
    for m in sasu or []:
        if m.get("violation"):
            signals.append(_sig("sasu_violation", "high", {"id": m.get("id"), "date": m.get("conclusion_date") or m.get("date")}, pc))
            notes["oversight"].append(["sasu_violation", {"id": m.get("id")}])
            break
    else:
        if any(m.get("status") in ("draft", "active") for m in sasu or []):
            notes["oversight"].append(["sasu_active", {}])

    if extra:
        signals += extra[0]
        for key, items in extra[1].items():
            notes[key] += items
    bad = {"disqualified_lower_bid", "missing_kb2v", "price_up", "overpaid", "paid_over_acts", "sasu_violation",
           "doc_unpublished", "advance_over_30", "advance_not_closed"}
    checklist = []
    for key, items in notes.items():
        codes = {c for c, _ in items}
        status = "bad" if codes & bad else "warn" if items else "ok"
        if key == "reconciliation" and codes == {"no_treasury"}:
            status = "na"
        checklist.append({"key": key, "status": status, "notes": items})
    return {"signals": signals, "checklist": checklist}


# ---- payments against the documents on the portal ------------------------------------------------
#
# Law No. 183-VIII on the openness of public funds: contracts, addendums and acts are published on
# spending.gov.ua within 5 working days of signing. A payment purpose names the addendum and the
# act it pays ("Д/у№5від14.07.2026р., акт прийм.викон.буд.робіт№1від14.07.2026р."); the portal
# record of each is compared with it.

_NUM = r"(?:№|N)\s*([0-9A-Za-zА-Яа-яІіЇїЄє/\-_.]+?)\s*(?:від|вiд|от)\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})"
ADDENDUM_REF = re.compile(r"(?<![а-яіїєґa-z])(?:д\s*/\s*у|д\.\s*у\.?|ду|дод(?:атков\w*|\.)?\s*угод\w*)\s*" + _NUM, re.I)
ACT_REF = re.compile(r"(?<![а-яіїєґa-z])акт\w*[^№;,]{0,40}?" + _NUM, re.I)
DATE_GAP_DAYS = 5
PUBLISH_WORKDAYS = 5


def _ref_date(m):
    day, month, year = int(m.group(2)), int(m.group(3)), int(m.group(4))
    if year < 100:
        year += 2000
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _num(x):
    return re.sub(r"[\s.№#]+", "", str(x or "")).lower().rstrip("-/")


def _workdays(start, end):
    if not start or not end or end <= start:
        return 0
    a, b = date.fromisoformat(start), date.fromisoformat(end)
    return sum(1 for i in range(1, (b - a).days + 1) if (a + timedelta(days=i)).weekday() < 5)


def doc_audit(pays, acts, addendums, changes):
    """Addendums and acts named in the payments, against their records on the portal.

    Returns [{kind, number, date, issue, ...}]: issue "unpublished" (paid, not on the portal),
    "date_mismatch" (the portal dates it otherwise), "published_late" (more than 5 working
    days after signing, `paid_first` when money went before it was published).
    """
    out, refs = [], {}
    for p in pays:
        if not p.get("sure"):
            continue
        for kind, rx in (("addendum", ADDENDUM_REF), ("act", ACT_REF)):
            for m in rx.finditer(p.get("purpose") or ""):
                d = _ref_date(m)
                if not d or not _num(m.group(1)):
                    continue
                r = refs.setdefault((kind, _num(m.group(1))), {"kind": kind, "number": m.group(1), "date": d, "pays": []})
                if p["id"] not in [x["id"] for x in r["pays"]]:
                    r["pays"].append({"id": p["id"], "date": p["date"], "amount": p["amount"]})
    registered = {"act": {_num(a.get("number")): a for a in acts}, "addendum": {_num(a.get("number")): a for a in addendums}}
    for (kind, num), r in sorted(refs.items(), key=lambda kv: (kv[1]["date"], kv[0])):
        first_pay = min(x["date"] for x in r["pays"])
        paid = round(sum(x["amount"] for x in r["pays"]), 2)
        reg = registered[kind].get(num)
        if not reg:
            e = {"kind": kind, "number": r["number"], "date": r["date"], "issue": "unpublished", "paid": paid, "first_pay": first_pay}
            if kind == "addendum":
                # Prozorro may have it: a change of the contract on (about) that day.
                near = [ch.get("date") for ch in changes or [] if ch.get("date") and abs((date.fromisoformat(ch["date"]) - date.fromisoformat(r["date"])).days) <= 3]
                e["prozorro"] = near[0] if near else None
            out.append(e)
        elif reg.get("date") and abs((date.fromisoformat(reg["date"]) - date.fromisoformat(r["date"])).days) > DATE_GAP_DAYS:
            out.append({"kind": kind, "number": r["number"], "date": r["date"], "issue": "date_mismatch", "portal_date": reg["date"], "paid": paid})
    for kind, docs in (("addendum", addendums), ("act", acts)):
        for a in docs:
            late = _workdays(a.get("date"), a.get("published"))
            if late > PUBLISH_WORKDAYS:
                paid_first = [x for (k, n), r in refs.items() if k == kind and n == _num(a.get("number")) for x in r["pays"] if x["date"] < a["published"]]
                out.append({"kind": kind, "number": a.get("number"), "date": a.get("date"), "issue": "published_late",
                            "published": a.get("published"), "days": late, "amount": a.get("amount"),
                            "paid_first": round(sum(x["amount"] for x in paid_first), 2) or None})
    return out


# ---- advance: at most 30% and used within three months (CMU Resolutions No. 1764 and No. 1070) ----
#
# Both allow an advance for works of up to 30% of the year's volume, to be used within three
# months and the rest returned. The contract price is at least the year's volume, so more than 30%
# of the price is surely over the limit. "Used" is read as covered by acts (КБ-2в) dated by then.

ADVANCE = re.compile(r"аванс|попередн\w*\s+оплат|передоплат|предоплат", re.I)
OFFSET = re.compile(r"погаш\w*\s+аванс|зарах\w*\s+аванс|з\s+урахуванням\s+аванс", re.I)
WORK_REF = re.compile(r"(?<![а-яіїєґa-z])акт|кб\s*-?\s*[23]|виконан\w*\s+(?:робіт|роб)", re.I)
ADVANCE_LIMIT = 0.30
ADVANCE_MONTHS = 3


def _add_months(day, n):
    d = date.fromisoformat(day)
    y, m = divmod(d.month - 1 + n, 12)
    y, m = d.year + y, m + 1
    last = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day
    return date(y, m, min(d.day, last)).isoformat()


def advance_check(pays, acts, value, today):
    """Advance payments of a contract: {advances, sum, pct, over, open} or None.

    An advance is a payment that says so, or (`likely`) one before the first act that names
    no act or КБ form. `open` is the worst one not covered by acts three months on.
    """
    sure = sorted((p for p in pays if p.get("sure")), key=lambda p: p["date"])
    first_act = min((a["date"] for a in acts if a.get("date")), default=None)
    adv = []
    for p in sure:
        text = p.get("purpose") or ""
        if OFFSET.search(text):
            continue
        if ADVANCE.search(text) and not ACT_REF.search(text):
            adv.append(dict(p, likely=False))
        elif not WORK_REF.search(text) and (first_act is None or p["date"] < first_act):
            adv.append(dict(p, likely=True))
    if not adv:
        return None
    total = round(sum(p["amount"] for p in adv), 2)
    res = {"advances": [{"id": p["id"], "date": p["date"], "amount": p["amount"], "likely": p["likely"]} for p in adv],
           "sum": total, "pct": round(total / value * 100, 1) if value else None, "over": bool(value) and total > value * ADVANCE_LIMIT + 1}
    worst = None
    for p in adv:
        deadline = _add_months(p["date"], ADVANCE_MONTHS)
        if deadline >= today:
            continue
        paid_by = sum(x["amount"] for x in sure if x["date"] <= p["date"])
        covered = sum(a.get("amount") or 0 for a in acts if a.get("date") and a["date"] <= deadline)
        unclosed = round(paid_by - covered, 2)
        if unclosed > 1 and (not worst or unclosed > worst["unclosed"]):
            worst = {"date": p["date"], "amount": p["amount"], "deadline": deadline, "unclosed": min(unclosed, total),
                     "days": (date.fromisoformat(today) - date.fromisoformat(deadline)).days, "likely": p["likely"]}
    res["open"] = worst
    return res


def payment_checks(pays, acts, addendums, changes, value, today, pc, acts_known=True):
    """Signals and checklist notes from the payments: documents and advance. Returns
    (signals, notes {checklist key: [[code, params]]}, doc_audit, advance)."""
    signals, notes = [], {"documents": [], "price": []}
    audit = doc_audit(pays, acts, addendums, changes) if acts_known else []
    for e in audit:
        if e["issue"] == "unpublished":
            signals.append(_sig("doc_unpublished", "medium", {k: e.get(k) for k in ("kind", "number", "date", "prozorro", "first_pay")}, pc, e["paid"]))
        elif e["issue"] == "date_mismatch":
            signals.append(_sig("doc_date_mismatch", "medium", {k: e.get(k) for k in ("kind", "number", "date", "portal_date")}, pc, e["paid"]))
    late = [e for e in audit if e["issue"] == "published_late"]
    if late:
        signals.append(_sig("doc_published_late", "low", {"n": len(late), "max": max(e["days"] for e in late),
                                                          "paid_first": sum(1 for e in late if e.get("paid_first"))}, pc))
    for code in ("unpublished", "date_mismatch", "published_late"):
        n = sum(1 for e in audit if e["issue"] == code)
        if n:
            notes["documents"].append(["doc_" + code, {"n": n}])
    adv = advance_check(pays, acts, value, today) if acts_known else None
    if adv and adv["over"]:
        signals.append(_sig("advance_over_30", "high", {"sum": adv["sum"], "pct": adv["pct"], "value": value}, pc, adv["sum"]))
        notes["price"].append(["advance_over_30", {"pct": adv["pct"]}])
    if adv and adv.get("open"):
        o = adv["open"]
        signals.append(_sig("advance_not_closed", "high", o, pc, o["unclosed"]))
        notes["price"].append(["advance_not_closed", {"sum": o["unclosed"], "days": o["days"]}])
    return signals, notes, audit, adv


# ---- the EIB part of the payments, from the VAT the buyer pays ----------------------------------
#
# The EIB loan pays the works net of VAT and outside the buyer's Treasury account; the buyer pays
# its co-financing (with VAT) and the VAT on the loan's part, often as a payment that is all VAT
# ("…в т.ч. ПДВ-394941,31." for 394 941,31). Per act: what the act is worth less what the buyer paid
# for it is the loan's part; with no act at hand, a VAT-only payment × 5 (20% VAT).

VAT = re.compile(r"(?:в\s*т\.?\s*ч\.?\s*)?пдв\s*(?:20\s*%\s*)?[-–—:=]?\s*(\d[\d  ]*[.,]\d{1,2})", re.I)


def _vat(text):
    m = VAT.search(text or "")
    if not m:
        return None
    try:
        return float(re.sub(r"[  ]", "", m.group(1)).replace(",", "."))
    except ValueError:
        return None


def eib_from_vat(pays, acts):
    """{"local", "eib", "total", "acts": [{number, date, amount, local, eib}]} or None when no
    payment of the buyer is a VAT-only one (then nothing says the loan paid)."""
    sure = [p for p in pays if p.get("sure")]
    vat_only = [p for p in sure if (lambda v: v is not None and abs(p["amount"] - v) <= 1.0)(_vat(p.get("purpose")))]
    if not vat_only:
        return None
    by_num = {_num(a.get("number")): a for a in acts}
    local_by_act, vat_acts, loose = {}, set(), 0.0
    for p in sure:
        nums = [_num(m.group(1)) for m in ACT_REF.finditer(p.get("purpose") or "")]
        known = [n for n in nums if n in by_num]
        if known:
            local_by_act[known[0]] = local_by_act.get(known[0], 0.0) + p["amount"]
            if p in vat_only:
                vat_acts.add(known[0])
        elif p in vat_only:
            loose += p["amount"] * 5.0
    rows = []
    for n in sorted(vat_acts, key=lambda n: by_num[n].get("date") or ""):
        a = by_num[n]
        eib = round((a.get("amount") or 0) - local_by_act.get(n, 0.0), 2)
        if eib > 0:
            rows.append({"number": a.get("number"), "date": a.get("date"), "amount": a.get("amount"), "local": round(local_by_act.get(n, 0.0), 2), "eib": eib})
    local = round(sum(p["amount"] for p in sure), 2)
    eib = round(sum(x["eib"] for x in rows) + loose, 2)
    return {"local": local, "eib": eib, "total": round(local + eib, 2), "acts": rows, "estimated": round(loose, 2)}
