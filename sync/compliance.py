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


def evaluate(t, pc, eib=False, paid=None, acts_sum=None, treasury=None, overdue=None, sasu=None):
    """Signals and checklist of one contract `pc` of procedure `t` (both compacted).

    paid / acts_sum come from the Treasury (payments and acts under the contract);
    treasury is its reconciled row (value0, price_up, flags) when one is linked.
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

    bad = {"disqualified_lower_bid", "missing_kb2v", "price_up", "overpaid", "paid_over_acts", "sasu_violation"}
    checklist = []
    for key, items in notes.items():
        codes = {c for c, _ in items}
        status = "bad" if codes & bad else "warn" if items else "ok"
        if key == "reconciliation" and codes == {"no_treasury"}:
            status = "na"
        checklist.append({"key": key, "status": status, "notes": items})
    return {"signals": signals, "checklist": checklist}
