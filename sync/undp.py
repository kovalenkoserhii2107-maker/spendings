"""What a UNDP compliance analyst keeps for a procurement and its contract (the working table's
Tenders and SPs sheets), gathered for every contract or procurement on control:

  - the procurement's course: announced, tender period, opening, auction, award, signing;
  - bidders and complaints to the Antimonopoly Committee, of the documents and of the evaluation;
  - price: expected, winning bid, contract price now, and how much it moved;
  - progress: acts and payments against the price, the contractual completion date;
  - the subvention set by the Cabinet of Ministers for the project (or its community);
  - the risk matrix of the table (8 criteria, 1–3) and its Overall Rating, computed the way the
    workbook's column M does;
and the changes of all of these between two syncs, as history events.
"""
import glob
import json
import os
import re
import statistics
from datetime import date

import contractor
import legal
import rules

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
OPEN_COMPLAINT = {"draft", "claim", "answered", "pending", "accepted"}
UPHELD = {"satisfied", "resolved"}
WEIGHT = {"r1": 1, "r2": 1.5, "r3": 1.5, "r4": 1.5, "r5": 1, "r6": 1, "r7": 1.5, "r8": 1}
KEYS = list(WEIGHT)


def _d(x):
    try:
        return date.fromisoformat(str(x)[:10]) if x else None
    except ValueError:
        return None


def _days(a, b):
    a, b = _d(a), _d(b)
    return (b - a).days if a and b else None


# ---- the procurement --------------------------------------------------------------------------

def _award_of(t, c):
    """The active award behind contract `c` (its lot and supplier), else the latest active one."""
    code = ((c or {}).get("suppliers") or [{}])[0].get("code")
    active = [a for a in t.get("awards") or [] if a.get("status") == "active"]
    for a in active:
        if (not (c or {}).get("lot") or not a.get("lot") or a.get("lot") == c.get("lot")) and (not code or a.get("supplier_code") == code):
            return a
    return active[-1] if active else None


def timeline(t, c):
    award = _award_of(t, c)
    start = t.get("tender_start") or t.get("date")
    c = c or {}
    months = _days(c.get("start") or c.get("signed"), c.get("end"))
    return {k: v for k, v in {
        "announced": t.get("date"), "tender_start": t.get("tender_start"), "enquiry_end": t.get("enquiry_end"),
        "opening": t.get("deadline"), "length_days": _days(start, t.get("deadline")), "auction": t.get("auction"),
        "award": award.get("date") if award else None, "signed": c.get("signed"), "start": c.get("start"), "end": c.get("end"),
        "duration_months": round(months / 30.44, 1) if months else None,
    }.items() if v not in (None, "")}


def bidders(t, c):
    """Everyone who got a qualification decision on the contract's lot: name, code, bid, outcome."""
    lot = (c or {}).get("lot")
    seen = {}
    for a in t.get("awards") or []:
        if lot and a.get("lot") and a.get("lot") != lot:
            continue
        key = a.get("supplier_code") or a.get("supplier_name")
        seen[key] = {k: v for k, v in {"name": a.get("supplier_name"), "code": a.get("supplier_code"), "amount": a.get("amount"),
                                         "status": a.get("status"), "date": a.get("date")}.items() if v is not None}
    return {"bids": t.get("bids"), "list": sorted(seen.values(), key=lambda x: x.get("amount") or 0)}


def complaints(t):
    """Complaints to the AMCU: of the tender documents and of the evaluation (claims apart)."""
    out = {}
    for of in ("tender", "award"):
        items = [x for x in t.get("complaints") or [] if (x.get("of") or "tender") == of]
        comp = [x for x in items if x.get("type") == "complaint"]
        out[of] = {"n": len(comp), "open": sum(1 for x in comp if x.get("status") in OPEN_COMPLAINT),
                   "upheld": sum(1 for x in comp if x.get("status") in UPHELD), "claims": len(items) - len(comp),
                   "items": [{k: x.get(k) for k in ("id", "status", "title", "date", "decided") if x.get(k)} for x in comp][:20]}
    return out


def price(t, c, tc):
    expected = (t.get("value") or {}).get("amount")
    award = _award_of(t, c)
    won = award.get("amount") if award else None
    now = ((c or {}).get("value") or {}).get("amount")
    # A bid without VAT and a contract with it are not a price rise: compare like with like.
    won_cmp = round(won * 1.2, 2) if won and award.get("vat") is False and ((c or {}).get("value") or {}).get("vat") else won
    first = (tc or {}).get("value0") or won_cmp
    change = round(now - first, 2) if now is not None and first else None
    return {k: v for k, v in {
        "expected": expected, "won": won, "first": first, "now": now, "change": change,
        "change_pct": round(change / first * 100, 1) if change is not None and first else None,
        "below_expected_pct": round((1 - won / expected) * 100, 1) if won and expected else None,
    }.items() if v is not None}


# ---- is the price right -----------------------------------------------------------------------

_PEERS = [None]
COMPETITIVE_OUT = ("reporting", "negotiation", "negotiation.quick")


def _peers():
    """Discounts from the expected value in the EIB procedures, by CPV: [(cpv, tid, discount%)]."""
    if _PEERS[0] is None:
        rows = []
        try:
            with open(os.path.join(DATA, "eib.json"), encoding="utf-8") as f:
                for x in json.load(f).get("items") or []:
                    exp = (x.get("value") or {}).get("amount")
                    if x.get("method") in COMPETITIVE_OUT or not exp:
                        continue
                    for a in x.get("awards") or []:
                        if a.get("status") == "active" and a.get("amount"):
                            d = (1 - a["amount"] / exp) * 100
                            if -5 < d < 80:
                                rows.append(((x.get("cpv") or "")[:8], x.get("tid"), d))
        except (OSError, ValueError):
            pass
        _PEERS[0] = rows
    return _PEERS[0]


def price_check(t, c, pr, related, contract_stage):
    """The price against similar EIB procedures, the law's abnormally low price, the plan, and what
    supervision costs against the works."""
    out = {}
    disc = (pr or {}).get("below_expected_pct")
    cpv = (t.get("cpv") or "")[:8]
    if disc is not None and t.get("method") not in COMPETITIVE_OUT and cpv:
        for n in (4, 3, 2):
            peers = sorted(d for p, tid, d in _peers() if p[:n] == cpv[:n] and tid != t.get("tid"))
            if len(peers) >= 8:
                below = sum(1 for d in peers if d < disc)
                out["peers"] = {"cpv": cpv[:n], "n": len(peers), "median": round(statistics.median(peers), 2),
                                "rank_pct": round(below / len(peers) * 100), "discount": disc}
                break
    lot = (c or {}).get("lot") or ""
    bf = (t.get("bid_facts") or {}).get(lot) or (next(iter((t.get("bid_facts") or {}).values()), None) if len(t.get("bid_facts") or {}) == 1 else None)
    if bf:
        out["bids"] = bf
    plan = sum(p.get("amount") or 0 for p in t.get("plan_info") or [])
    if plan:
        now = (pr or {}).get("now") or (pr or {}).get("expected")
        out["plan"] = {"amount": round(plan, 2), "over_pct": round((now / plan - 1) * 100, 1) if now and now > plan + 1 else None}
    works = (pr or {}).get("now") if contract_stage else None
    if works and related and (t.get("category") == "works" or cpv.startswith("45")):
        for role in ("supervision", "author"):
            v = sum(((r.get("value") or {}).get("amount") or 0) for r in related if r.get("role") == role and r.get("status") not in ("cancelled", "unsuccessful"))
            if v:
                out[role] = {"amount": round(v, 2), "pct": round(v / works * 100, 2)}
    return {k: v for k, v in out.items() if v} or None


def progress(value, acts_sum, paid, end, today, status=None):
    acts_pct = round(acts_sum / value * 100, 1) if value and acts_sum is not None else None
    # A terminated contract is not late; one still in force past its end date is.
    late = _days(end, today) if end and status == "active" else None
    return {k: v for k, v in {
        "acts_pct": acts_pct, "paid_pct": round(paid / value * 100, 1) if value and paid is not None else None,
        "end": end, "overdue_days": late if late and late > 0 and (acts_pct is None or acts_pct < 95) else None,
    }.items() if v is not None}


# ---- the subvention of the Cabinet of Ministers ----------------------------------------------

_SUBV = [None]


def _subvention_file():
    if _SUBV[0] is None:
        try:
            with open(os.path.join(DATA, "subvention.json"), encoding="utf-8") as f:
                _SUBV[0] = json.load(f)
        except (OSError, ValueError):
            _SUBV[0] = {}
    return _SUBV[0]


def _words(s):
    return [w for w in re.sub(r"[^0-9а-яіїєґa-z]+", " ", re.sub(r"[’'`ʼ]", "", str(s or "").lower())).split() if len(w) > 2 or w.isdigit()]


_CPV = re.compile(r"^\s*(?:ДК\s*021\s*[:\-]?\s*2015\s*[:\-]?\s*(?:\(?CPV\)?)?\s*[:\-]?\s*)?\d{8}-\d\s*[-–—:]?\s*", re.I)


def _object(title):
    text = str(title or "")
    rest = _CPV.sub("", text)
    if rest != text and "(" in rest and len(rest.split("(", 1)[0].split()) <= 8:
        rest = rest.split("(", 1)[1]
    return rest


def _match(name, project):
    a_all, b_all = _words(_object(name)), _words(project)
    a = [w for w in a_all if not w.isdigit()][:14]
    b = set(w for w in b_all if not w.isdigit())
    score = sum(1 for w in a if w in b) / len(a) if a else 0
    na, nb = [w for w in a_all if w.isdigit()], set(w for w in b_all if w.isdigit())
    if any(x not in nb for x in na) and any(len(x) <= 3 and x not in na for x in nb):
        score *= 0.4
    return score


def _stem_eq(a, b):
    n = min(len(a), len(b))
    i = 0
    while i < n and a[i] == b[i]:
        i += 1
    return n >= 4 and i >= max(4, round(n * 0.75))


_SKIP = ("бюджет", "територіальн", "громад", "міськ", "селищн", "сільськ", "обласн", "област", "рад", "район", "управлін", "відділ",
         "департамент", "виконавч", "комітет", "державн", "адміністрац", "військов", "капітальн", "будівництв", "житлов", "комунальн")


def subvention(t):
    """The project's line in the CMU distribution (by the procurement's title), else its
    community's budget line (by the buyer's name): {nreg, programme, level, name, budget, amounts, editions}."""
    data = _subvention_file()
    projects = data.get("projects") or []
    if not projects:
        return None
    decrees = {d["nreg"]: d for d in data.get("decrees") or []}
    best, score = None, 0
    for p in projects:
        if p.get("name"):
            sc = _match(t.get("title"), p["name"])
            if sc > score:
                best, score = p, sc
    hit = best if score >= 0.8 else None
    if not hit:
        buyer = [w for w in _words(t.get("buyer_name")) if len(w) >= 5 and not w.startswith(_SKIP)]
        region = (t.get("region") or "")[:-2]
        oblast = re.search(r"обласн\w* (?:державн|військов)|ОДА|облдержадмін", t.get("buyer_name") or "", re.I)
        for p in projects:
            if p.get("name"):
                continue
            if oblast and p["budget"].startswith("Обласний бюджет") and region and region in p["budget"]:
                hit = p
                break
            if region and region not in (p.get("region") or "") and region not in p["budget"]:
                continue
            bw = [w for w in _words(p["budget"]) if len(w) >= 5 and not w.startswith(_SKIP)]
            if any(_stem_eq(w, x) for w in buyer for x in bw):
                hit = p
                break
    if not hit:
        return None
    d = decrees.get(hit.get("nreg")) or {}
    eds = d.get("editions") or sorted(hit.get("amounts") or {})
    return {k: v for k, v in {
        "nreg": hit.get("nreg"), "programme": hit.get("programme"), "level": "project" if hit.get("name") else "budget",
        "name": hit.get("name"), "budget": hit.get("budget"), "region": hit.get("region"), "amounts": hit.get("amounts"),
        "editions": eds, "url": d.get("url"), "now": (hit.get("amounts") or {}).get(eds[-1]) if eds else None,
        "max": max((hit.get("amounts") or {0: 0}).values()),
    }.items() if v not in (None, "")}


# ---- is the year's subvention enough ----------------------------------------------------------

def funding(subv, value, paid_total, acts, eib_paid, start, today):
    """The table's Funding Adequacy Status and Additional Funding Needs, estimated: the year's
    subvention in force less the loan's part paid this year, against the works expected by the year's
    end (this year's pace of acts, capped by what is left of the price) times the loan's share of
    payments. Only for a subvention set for the project itself."""
    if not subv or subv.get("level") != "project" or not value:
        return None
    year = today[:4]
    now = subv.get("now")
    year_subv = round((now or 0) * 1000, 2)
    remaining = round(max(0.0, value - (paid_total or 0)), 2)
    known = bool(eib_paid and eib_paid.get("total") and eib_paid.get("eib"))
    # The loan's part paid this year is known only when the Treasury shows the tranches.
    eib_year = round(sum(a["eib"] for a in eib_paid.get("acts") or [] if str(a.get("date") or "").startswith(year)), 2) if known else None
    # Unless the payments show it, the loan is taken to pay the price without VAT (5/6).
    share = (eib_paid["eib"] / eib_paid["total"]) if known else 5 / 6
    left = round(year_subv - (eib_year or 0), 2)
    acts_year = sum(a.get("amount") or 0 for a in acts or [] if str(a.get("date") or "").startswith(year))
    first = max(_d(year + "-01-01"), _d(start) or _d(year + "-01-01"))
    months_gone = max(1.0, (_d(today) - first).days / 30.44)
    months_left = max(0.0, (_d(year + "-12-31") - _d(today)).days / 30.44)
    forecast = round(min(remaining, acts_year / months_gone * months_left), 2) if acts_year else 0.0
    need = round(forecast * share, 2) if share is not None else None
    if (now is None or now <= 1) and remaining > 1:
        status = "suspended"
    elif need is not None and need > left + 1:
        status = "insufficient"
    elif share is not None and left > remaining * share + 1:
        status = "excess"
    else:
        status = "adequate"
    return {k: v for k, v in {
        "status": status, "year_subvention": year_subv, "eib_paid_year": eib_year, "left": left,
        "util_pct": round(eib_year / year_subv * 100, 1) if year_subv and eib_year is not None else None, "remaining": remaining,
        "forecast": forecast, "share_pct": round(share * 100, 1) if share is not None else None,
        "need": need, "gap": round(need - left, 2) if need is not None and need > left else 0.0,
        "share_est": not known or None, "programme": subv.get("programme"), "nreg": subv.get("nreg"),
    }.items() if v is not None}


# ---- the contractor elsewhere ----------------------------------------------------------------

_OTHERS = [None]


def contractor_record(code, own_key):
    """Other EIB and on-control contracts of the same contractor with a serious signal."""
    if not code:
        return None
    if _OTHERS[0] is None:
        rows = []
        try:
            with open(os.path.join(DATA, "eib.json"), encoding="utf-8") as f:
                for t in json.load(f).get("items") or []:
                    for c in t.get("contracts") or []:
                        rows.append({"key": c.get("id"), "tid": t.get("tid"), "number": c.get("number"), "codes": [s.get("code") for s in c.get("suppliers") or []],
                                     "bad": [x["type"] for x in c.get("signals") or [] if x.get("severity") == "high"]})
        except (OSError, ValueError):
            pass
        for path in glob.glob(os.path.join(DATA, "tracked", "*.json")):
            if path.endswith("index.json"):
                continue
            try:
                with open(path, encoding="utf-8") as f:
                    s = json.load(f)
            except (OSError, ValueError):
                continue
            c = s.get("contract") or {}
            rows.append({"key": s.get("key"), "tid": s.get("tid"), "number": c.get("number"), "codes": [x.get("code") for x in c.get("suppliers") or []],
                         "bad": [x["type"] for x in s.get("signals") or [] if x.get("severity") == "high"]
                         + (["overdue"] if ((s.get("undp") or {}).get("progress") or {}).get("overdue_days") else [])})
        _OTHERS[0] = rows
    mine = [r for r in _OTHERS[0] if code in r["codes"] and r["key"] != own_key]
    seen, out = set(), []
    for r in mine:
        if r["key"] in seen:
            continue
        seen.add(r["key"])
        out.append({k: v for k, v in {"tid": r["tid"], "number": r["number"], "bad": sorted(set(r["bad"]))}.items() if v})
    prof = contractor.load(code, DATA)
    return {k: v for k, v in {"contracts": len(out), "troubled": [x for x in out if x.get("bad")][:10],
            "flags": (prof or {}).get("flags") or None, "load": (prof or {}).get("load")}.items() if v is not None}


# ---- legal standing ---------------------------------------------------------------------------

_LEGAL = [None]


def _legal():
    if _LEGAL[0] is None:
        _LEGAL[0] = legal.load(DATA)
    return _LEGAL[0]


def legal_card(code, signed, today):
    """What the registers say of the contractor: state, sanctions, AMCU bid-rigging decisions."""
    data = _legal()
    rec = (data.get("items") or {}).get(code)
    if not rec:
        return None
    e = rec.get("edr") or {}
    return {k: v for k, v in {
        "flags": [{"kind": k, "level": lv} for k, lv in legal.flags(rec, today, signed)],
        "edr": {k: v for k, v in {"stan": e.get("stan"), "registered": e.get("registered"), "capital": e.get("capital"),
                                  "terminating": e.get("terminating"), "bankruptcy": e.get("bankruptcy"), "terminated": e.get("terminated"),
                                  "ubo_absent": e.get("ubo_absent"), "citizenship": e.get("citizenship"),
                                  "founders": len(e.get("founders") or []) + len(e.get("founder_codes") or []) or None,
                                  "beneficiaries": len(e.get("beneficiaries") or []) or None}.items() if v is not None} if e else None,
        "sanctions": rec.get("sanctions"), "amcu": rec.get("amcu"), "edr_missing": bool(rec.get("edr_missing")) or None,
        "checked": {k: data.get(k) for k in ("edr_at", "sanctions_at", "amcu_at") if data.get(k)},
    }.items() if v is not None}


def owner_links(t, c):
    """The same founder, beneficiary or manager behind two bidders, or behind the winner and the
    buyer (the ЄДР's people, compared by hash)."""
    items = _legal().get("items") or {}

    def people(code):
        e = (items.get(code) or {}).get("edr") or {}
        return set(e.get("founders") or []) | set(e.get("beneficiaries") or []) | set(e.get("signers") or []), set(e.get("founder_codes") or [])

    def name(code):
        e = (items.get(code) or {}).get("edr") or {}
        return (e.get("short") or e.get("name") or code)[:160]

    out = []
    codes = [x for x in t.get("bidder_codes") or [] if x in items]
    for i, a in enumerate(codes):
        pa, ca = people(a)
        for b in codes[i + 1:]:
            pb, cb = people(b)
            if pa & pb or a in cb or b in ca or ca & cb:
                out.append({"kind": "shared_owner", "level": "high", "a": a, "b": b, "a_name": name(a), "b_name": name(b)})
    sup = ((c or {}).get("suppliers") or [{}])[0].get("code")
    buyer = t.get("buyer")
    if sup and buyer and sup in items and buyer in items:
        ps, _ = people(sup)
        bs = set(((items.get(buyer) or {}).get("edr") or {}).get("signers") or [])
        if ps & bs:
            out.append({"kind": "buyer_owner", "level": "high", "a": sup, "a_name": name(sup)})
    return out


# ---- the risk matrix --------------------------------------------------------------------------

def overall(sc):
    """Overall Rating as the workbook's column M: blank ratings count as 0."""
    if all(sc.get(k) is None for k in KEYS):
        return None
    v = {k: sc.get(k) or 0 for k in KEYS}
    crit = [v["r2"], v["r3"], v["r4"], v["r7"]]
    if crit.count(3) >= 1 or crit.count(2) >= 3:
        return 3
    avg = sum(v[k] * WEIGHT[k] for k in KEYS) / sum(WEIGHT.values())
    if avg >= 1.8:
        return 3
    if crit.count(2) >= 1 or 3 in v.values() or avg >= 1.4:
        return 2
    return 1


PRICE_UP_RED = 15  # % of the original price: the EIB's Guide to Procurement sends such changes to the Bank
LEGAL_STATUS = {"terminated", "bankruptcy", "terminating", "young"}
TERMINATE = re.compile(r"розірв|припин\w* (дію )?договор", re.I)
OVERPAID = re.compile(r"зайв\w* (сплач|оплач|перерах)|переплат|завищен\w* (варт|обсяг)|надмірн\w* сплач", re.I)


def sasu_severe(m, today):
    """Why a State Audit violation rates 3, or None: not removed by its deadline, the contract to be
    ended, money overpaid."""
    text = " ".join([m.get("obligations") or "", m.get("conclusion") or "", m.get("findings") or ""])
    if TERMINATE.search(m.get("obligations") or ""):
        return "sasu_terminate"
    if OVERPAID.search(text):
        return "sasu_overpaid"
    due = m.get("elimination_due")
    if due and due < (today or "") and not m.get("elimination_date"):
        return "sasu_not_removed"
    return None


def matrix(c, signals, totals, price_, subv, record, audit, comp, advance, contract_stage, fund=None, coll=None, lg=None, pc=None, rl=None, today=None):
    """Ratings 1–3 with the reasons, where there is something to judge by; 6 (the contractor's
    legal status) stays with the expert."""
    types = {x["type"] for x in signals or []}
    sc, why = {}, {}

    def put(k, n, *reason):
        sc[k] = n
        if reason:
            why[k] = [r for r in reason if r]

    # The team's rules (approved 20.11.2026): 3 from a cumulative price rise above 15% (the EIB's
    # Guide sends such a change to the Bank), 2 for any rise up to that, three or more extensions,
    # or five or more amendments.
    if contract_stage:
        changes = [ch for ch in (c or {}).get("changes") or []]
        ext = sum(1 for ch in changes if {"durationExtension", "fiscalYearExtension"} & set(ch.get("types") or []))
        pct = (price_ or {}).get("change_pct")
        up = [x for x in signals or [] if x.get("type") == "price_up"]
        up_pct = max([(x.get("params") or {}).get("pct") or 0 for x in up] + [pct or 0])
        if up_pct > PRICE_UP_RED:
            put("r1", 3, "price_up:%s" % up_pct)
        elif up_pct > 0 or up or len(changes) >= 5 or ext >= 3 or "chain_extensions" in types:
            put("r1", 2, "price_up:%s" % up_pct if up_pct > 0 else None, "changes:%d" % len(changes) if len(changes) >= 5 else None,
                "extensions:%d" % ext if ext >= 3 else None, "chain_extensions" if "chain_extensions" in types else None)
        else:
            put("r1", 1, "changes:%d" % len(changes) if changes else None)
    high = sorted({"coll_" + f["kind"] for f in coll or [] if f.get("level") == "high"})
    medium = sorted({"coll_" + f["kind"] for f in coll or [] if f.get("level") == "medium"})
    bf, plan = (pc or {}).get("bids") or {}, (pc or {}).get("plan") or {}
    if bf.get("abnormal"):
        (medium if bf.get("justified") else high).append("abnormal_price")
    if (plan.get("over_pct") or 0) > 0:
        medium.append("over_plan")
    # The programme's rules broken by the data (tender period, bid security, signing, independence).
    r_hi, r_md = rules.worst(rl)
    high += r_hi
    medium += r_md
    if "disqualified_lower_bid" in types or high:
        put("r2", 3, "disqualified_lower_bid" if "disqualified_lower_bid" in types else None, *high)
    elif "single_bidder" in types or medium:
        put("r2", 2, "single_bidder" if "single_bidder" in types else None, *medium)
    elif (price_ or {}).get("won"):
        put("r2", 1)
    if subv:
        now, top = subv.get("now"), subv.get("max") or 0
        st = (fund or {}).get("status")
        if now is None or (now <= 1 and top > 1):
            put("r3", 3, "subvention_dropped" if now is None else "subvention_token")
        elif st == "insufficient" and (fund.get("gap") or 0) > (fund.get("year_subvention") or 0) * 0.25:
            put("r3", 3, "funding_gap")
        elif now < top - 0.5 or st == "insufficient":
            put("r3", 2, "subvention_cut" if now < top - 0.5 else "funding_gap")
        else:
            put("r3", 1)
    if contract_stage:
        due, over = (totals or {}).get("due_now") or 0, (totals or {}).get("overdue") or 0
        if "advance_not_closed" in types or (due and over > due * 0.1 and not (totals or {}).get("partial")):
            put("r4", 3, "advance_not_closed" if "advance_not_closed" in types else "overdue")
        elif over > 1 and not (totals or {}).get("partial"):
            put("r4", 2, "overdue")
        elif due:
            put("r4", 1)
    if record is not None:
        n = len(record.get("troubled") or [])
        fl = {f["kind"]: f["level"] for f in (record.get("flags") or [])}
        lvl = 3 if n >= 2 or fl.get("overloaded") == "high" else 2 if n or fl else 1
        put("r5", lvl, "troubled:%d" % n if n else None, "overloaded" if "overloaded" in fl else None, "newcomer" if "newcomer" in fl else None)
    # 6 is the contractor's legal standing only (bankruptcy, liquidation, reorganisation, a company
    # under a year old). Sanctions, owners from RU/BY, hidden owners and AMCU bid-rigging decisions
    # belong to the Anti-Corruption & Integrity block, which its analyst rates: they are shown
    # ("rx", other) but do not rate 6.
    if lg is not None:
        fl = lg.get("flags") or []
        hi = [f["kind"] for f in fl if f["kind"] in LEGAL_STATUS and f["level"] == "high"]
        md = [f["kind"] for f in fl if f["kind"] in LEGAL_STATUS and f["level"] == "medium"]
        integrity = [f for f in fl if f["kind"] not in LEGAL_STATUS]
        if hi:
            put("r6", 3, *["legal_" + k for k in hi])
        elif md:
            put("r6", 2, *["legal_" + k for k in md])
        elif lg.get("edr"):
            put("r6", 1)
        if integrity:
            put("rx", 3 if any(f["level"] == "high" for f in integrity) else 2, *["legal_" + f["kind"] for f in integrity])
    # 7: a violation the buyer removed, or is still in time to remove, or appeals is 2; 3 only when it
    # was not removed by the conclusion's deadline, or the conclusion demands the contract be ended,
    # or the audit found money overpaid.
    if audit is not None:
        bad = [m for m in audit if m.get("violation")]
        severe = [m for m in bad if sasu_severe(m, today)]
        if severe:
            put("r7", 3, *sorted({sasu_severe(m, today) for m in severe}))
        elif bad:
            put("r7", 2, "sasu_violation_fixed" if all(m.get("elimination_date") for m in bad) else "sasu_violation")
        elif any(m.get("status") in ("draft", "active") for m in audit):
            put("r7", 2, "sasu_active")
        else:
            put("r7", 1)
    # 8: an upheld complaint whose decision was carried out is 2; two or more upheld is 3.
    up = sum((comp or {}).get(of, {}).get("upheld", 0) for of in ("tender", "award"))
    op = sum((comp or {}).get(of, {}).get("open", 0) for of in ("tender", "award"))
    if up >= 2:
        put("r8", 3, "amcu_upheld:%d" % up)
    elif up or op:
        put("r8", 2, "amcu_upheld:%d" % up if up else None, "amcu_open:%d" % op if op else None)
    else:
        put("r8", 1)
    for k in KEYS:
        sc.setdefault(k, None)
    return {"scores": sc, "why": why, "overall": overall(sc)}


def card(t, c, tc, signals, totals, acts_sum, paid, audit, advance, own_key, today, contract_stage=True, acts=None, eib_paid=None, related=None):
    tl = timeline(t, c)
    pr = price(t, c, tc) if contract_stage else price(t, None, None)
    comp = complaints(t)
    subv = subvention(t)
    lot = (c or {}).get("lot")
    coll = [f for f in t.get("collusion") or [] if not f.get("lot") or not lot or f.get("lot") == lot] + owner_links(t, c)
    pc = price_check(t, c, pr, related, contract_stage)
    lg = legal_card(((c or {}).get("suppliers") or [{}])[0].get("code"), (c or {}).get("signed"), today) if contract_stage else None
    record = contractor_record(((c or {}).get("suppliers") or [{}])[0].get("code"), own_key) if contract_stage else None
    value = ((c or {}).get("value") or {}).get("amount") or (t.get("value") or {}).get("amount")
    fund = funding(subv, value, paid, acts, eib_paid, (c or {}).get("start") or (c or {}).get("signed"), today) if contract_stage else None
    code = ((c or {}).get("suppliers") or [{}])[0].get("code")
    rl = rules.check(t, c, related=related, advance=advance, acts=acts, paid_total=paid, legal_items=_legal().get("items") or {},
                     profile=contractor.load(code, DATA) if code else None,
                     docs=list((c or {}).get("docs") or []) + list(t.get("docs") or []), contract_stage=contract_stage, subv=subv)
    return {k: v for k, v in {
        "timeline": tl, "bidders": bidders(t, c), "complaints": comp, "price": pr,
        "progress": progress(value, acts_sum, paid, (c or {}).get("end"), today, (c or {}).get("status")) if contract_stage else None,
        "subvention": subv, "contractor": record,
        "funding": fund,
        "collusion": coll if t.get("collusion") is not None else None,
        "legal": lg,
        "price_check": pc,
        "rules": rl,
        "matrix": matrix(c, signals, totals, pr, subv, record, audit, comp, advance, contract_stage, fund, coll, lg, pc, rl, today),
    }.items() if v is not None}


# ---- what changed ------------------------------------------------------------------------------

def events(old, new, event):
    """History events between the old and new card (`event(kind, **params)` makes one)."""
    out = []
    if not old:
        return out
    oc, nc = old.get("complaints") or {}, new.get("complaints") or {}
    for of in ("tender", "award"):
        before = {x.get("id"): x for x in (oc.get(of) or {}).get("items") or []}
        for x in (nc.get(of) or {}).get("items") or []:
            was = before.get(x.get("id"))
            if not was:
                out.append(event("complaint", of=of, status=x.get("status"), title=(x.get("title") or "")[:160]))
            elif was.get("status") != x.get("status"):
                out.append(event("complaint_status", of=of, old=was.get("status"), new=x.get("status"), title=(x.get("title") or "")[:160]))
    ot, nt = old.get("timeline") or {}, new.get("timeline") or {}
    for k in ("opening", "auction", "award"):  # the contract's end has an event of its own
        if nt.get(k) and nt.get(k) != ot.get(k):
            out.append(event("timeline", field=k, old=ot.get(k), new=nt.get(k)))
    ob, nb = (old.get("bidders") or {}).get("bids"), (new.get("bidders") or {}).get("bids")
    if nb and nb != ob:
        out.append(event("bids", old=ob, new=nb))
    os_, ns = old.get("subvention") or {}, new.get("subvention") or {}
    if ns and (ns.get("now") != os_.get("now") or len(ns.get("editions") or []) != len(os_.get("editions") or [])):
        out.append(event("subvention", old=os_.get("now"), new=ns.get("now"), edition=(ns.get("editions") or [""])[-1], nreg=ns.get("nreg")))
    was = {(f.get("kind"), f.get("a"), f.get("b")) for f in old.get("collusion") or []}
    for f in new.get("collusion") or []:
        if (f.get("kind"), f.get("a"), f.get("b")) not in was and f.get("level") != "low" and old.get("collusion") is not None:
            out.append(event("collusion", kind=f.get("kind"), level=f.get("level"), a=f.get("a_name") or f.get("a"), b=f.get("b_name") or f.get("b")))
    ol = {f["kind"] for f in (old.get("legal") or {}).get("flags") or []}
    for f in (new.get("legal") or {}).get("flags") or []:
        if f["kind"] not in ol and old.get("legal") is not None:
            out.append(event("legal", kind=f["kind"], level=f["level"]))
    if old.get("rules") is not None:
        was = {x["key"] for x in rules.items(old.get("rules")) if x.get("st") == "bad"}
        for x in rules.items(new.get("rules")):
            if x.get("st") == "bad" and x["key"] not in was:
                out.append(event("rule", key=x["key"], level=x.get("level")))
    of_, nf = (old.get("funding") or {}).get("status"), (new.get("funding") or {}).get("status")
    if nf and of_ and nf != of_:
        out.append(event("funding", old=of_, new=nf, gap=(new.get("funding") or {}).get("gap")))
    oo, no = (old.get("matrix") or {}).get("overall"), (new.get("matrix") or {}).get("overall")
    if no and no != oo:
        out.append(event("matrix", old=oo, new=no))
    if (new.get("progress") or {}).get("overdue_days") and not (old.get("progress") or {}).get("overdue_days"):
        out.append(event("completion_overdue", end=(new.get("progress") or {}).get("end")))
    return out


def sasu_events(old, new, event):
    """New State Audit monitorings and changes of their status or finding."""
    before = {m.get("id"): m for m in old or []}
    out = []
    for m in new or []:
        was = before.get(m.get("id"))
        if not was:
            out.append(event("sasu", id=m.get("id"), status=m.get("status"), violation=m.get("violation")))
        elif was.get("status") != m.get("status") or was.get("violation") != m.get("violation"):
            out.append(event("sasu_status", id=m.get("id"), old=was.get("status"), new=m.get("status"), violation=m.get("violation")))
    return out
