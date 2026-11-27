"""The programme's own rules for a procurement and its contract, by the edition of the
Implementation Guidelines (PIG, with its Procurement Manual for national procedures) it falls under:

  - urp3_2026: «Програма відновлення України ІІІ», all pools, the edition and model tender documents
    approved on 2 November 2026 (Mindev letter 18417/31/14-26);
  - urp3_2024: ПВУ ІІІ, the first edition (2024, FI 97043, Law 3905-IX);
  - urp_2024:  «Програма з відновлення України» (ПВУ) and «Надзвичайна кредитна програма для
    відновлення України» (НКПВУ), the edition approved by the EIB on 3 May 2024;
  - urp_2026:  ПВУ and НКПВУ procurements from 13 July 2026, under that edition's model tender
    documents (20 days for supervision and the consulting engineer as well).

The programme is read from the procurement (its title, plan and funding sources) or the Cabinet's
subvention line; without it, the most lenient edition's figures are used and nothing is called
broken, only worth checking.

Each check is {key, st, level, p}: st "ok" (the rule is kept), "bad" (it is not, by the data),
"check" (the data point at something the expert has to see in the documents), "na" (does not
apply). What Prozorro and the Treasury cannot show (the bank's no-objection, turnover, the
declaration of readiness) is a "check" with the figures the expert needs.
"""
import json
import os
import re
import urllib.request
from datetime import date, timedelta

import prozorro

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

OPEN = {"aboveThreshold", "aboveThresholdUA", "aboveThresholdEU", "competitiveDialogueUA", "competitiveDialogueEU"}
INTERNATIONAL = {"aboveThresholdEU", "competitiveDialogueEU"}
NON_COMPETITIVE = {"negotiation", "negotiation.quick", "reporting"}
INTL_EUR = {"works": 5_000_000, "ts": 200_000, "csc": 200_000}   # Manual 3: international tender from here
MIN_DAYS = {"works": 20, "ts": 15, "csc": 15}                    # Manual 8: tender period, calendar days
SHARE_MAX = {"ts": 1.5, "csc": 2.0}                              # PIG 4.3: % of chapters 1–9 of the estimate
CSC_FROM_EUR = 3_000_000                                         # PIG 4.3: consulting engineer from €3M
BID_SECURITY_MAX = 0.5                                           # Manual 5.2: % of the expected value
STANDSTILL = (5, 15)
STANDSTILL_EU = 10                                             # Особливості: days after the intent notice
SIMILAR_SHARE = 0.30                                             # model TD: a similar contract ≥30%
LOAD_SHARE = 0.50                                                # model TD 6.2.4: turnover ≥50% of open contracts
FINAL_PCT = 95                                                   # PIG 5.8.4: interim payments up to 95%
GUARANTEE_DAYS = 30                                              # PIG 5.8.3: after the advance is closed

# What differs between the editions. "from": procurements announced before it were run under an
# earlier edition still, so there a broken rule is only one to check.
EDITIONS = {
    "urp3_2026": {"from": "2026-11-02", "years": 2, "similar": {"n": 1, "within": 7, "share": 0.30}, "turnover": "3of7",
                  "load": {"years": 5, "urp3": True}, "bid_security": True, "csc_max": 2.0, "advance_30": True, "tranche_b": True},
    "urp3_2024": {"from": "2024-08-20", "years": 4, "similar": {"n": 2, "within": 7}, "turnover": "4",
                  "load": {"years": 5, "urp3": False}, "bid_security": True, "csc_max": 2.0},
    "urp_2024": {"from": "2024-05-03", "years": 4, "similar": {"n": 2, "within": 5}, "turnover": "5",
                 "load": {"years": 2, "urp3": False}, "bid_security": False, "csc_max": 3.0},
    # The model tender documents for ПВУ and НКПВУ of 13 July 2026: the same criteria, but 20 days
    # for supervision and the consulting engineer too.
    "urp_2026": {"from": "2026-07-13", "years": 4, "similar": {"n": 2, "within": 5}, "turnover": "5",
                 "load": {"years": 2, "urp3": False}, "bid_security": False, "csc_max": 3.0,
                 "min_days": {"works": 20, "ts": 20, "csc": 20}},
}
URP3_TEXT = re.compile(r"(відновлення\s+україни\s*(ІІІ|III|3)(?![\wІ])|\bПВУ\s*(ІІІ|III)(?![\wІ])|3121690|\b7367\b|97\s?043"
                       r"|(?<!\d)(?:3905|4611)\s*-\s*[IІ][XХ](?![A-Za-zА-Яа-я])|URP\s*III)", re.I)
# The laws that ratify the two tranches of ПВУ ІІІ: No. 3905-IX (A) and No. 4611-IX (B), not any "4611".
TRANCHE_A = re.compile(r"(?<!\d)3905\s*-\s*[IІ][XХ](?![A-Za-zА-Яа-я])")
TRANCHE_B = re.compile(r"(?<!\d)4611\s*-\s*[IІ][XХ](?![A-Za-zА-Яа-я])")
UERP_TEXT = re.compile(r"(надзвичайн\w*\s+кредитн\w*\s+програм|НКПВУ|\bUERP\b|\bERP\b)", re.I)
URP_TEXT = re.compile(r"(програм\w*\s+(?:з\s+)?відновлення\s+україни|\bПВУ\b|\bURP\b)", re.I)

ES_PACT = re.compile(r"(екологічн\w*\s+(і|та)\s+соціальн|соціальн\w*\s+(і|та)\s+екологічн|\bE\s*&\s*S\b|environmental\s+and\s+social)", re.I)
INTEGRITY = re.compile(r"(професійн\w*\s+чесн|доброчесн|integrity|covenant)", re.I)
CSC_TITLE = re.compile(r"інженер\w*[\s\-‐–]*консультант|consulting\s+engineer", re.I)
NOT_PROGRAMME = re.compile(r"UPBEE|енергоефективн\w*\s+громадськ", re.I)


def _d(x):
    try:
        return date.fromisoformat(str(x)[:10]) if x else None
    except ValueError:
        return None


def _days(a, b):
    a, b = _d(a), _d(b)
    return (b - a).days if a and b else None


def _texts(t):
    out = [t.get("title") or "", t.get("rationale") or ""]
    for pl in t.get("plan_info") or []:
        for src in (pl.get("sources") if isinstance(pl, dict) else None) or []:
            out += [str(src.get("text") or ""), str(src.get("program") or "")]
    return " ".join(out)


def programme(t, subv=None):
    """(programme, tranche): "urp3" | "urp" | "uerp" | None, and "A" | "B" | None for ПВУ ІІІ."""
    text = _texts(t)
    tranche = "B" if TRANCHE_B.search(text) else "A" if TRANCHE_A.search(text) else None
    if URP3_TEXT.search(text):
        return "urp3", tranche
    if UERP_TEXT.search(text):
        return "uerp", None
    if URP_TEXT.search(text):
        return "urp", None
    # The team's register knows the sub-project's programme.
    if t.get("programme_undp") in ("urp3", "urp", "uerp"):
        return t["programme_undp"], tranche if t["programme_undp"] == "urp3" else None
    # The CMU distribution names the programme: the project's own line, or its community's budget line.
    if subv and subv.get("level") in ("project", "budget"):
        return {"URP III": "urp3", "URP": "urp", "UERP": "uerp"}.get(subv.get("programme")), None
    return None, None


def edition(t, subv=None):
    """The edition a procurement falls under: (key, programme, tranche, strict)."""
    prog, tranche = programme(t, subv)
    day = t.get("date") or ""
    if prog == "urp3":
        key = "urp3_2026" if day >= EDITIONS["urp3_2026"]["from"] else "urp3_2024"
    elif prog in ("urp", "uerp"):
        key = "urp_2026" if day >= EDITIONS["urp_2026"]["from"] else "urp_2024"
    else:  # unknown: the newest edition for new procurements, else the most lenient figures
        key = "urp3_2026" if day >= EDITIONS["urp3_2026"]["from"] else "urp_2024"
    return key, prog, tranche, bool(prog) and day >= EDITIONS[key]["from"]


def kind(t):
    """works | ts | csc, or None for what the rules do not cover."""
    title = t.get("title") or ""
    if (t.get("cpv") or "").startswith("45") or t.get("category") == "works":
        return "works"
    if CSC_TITLE.search(title):
        return "csc"
    role = prozorro.related_role(title)
    return {"supervision": "ts", "consulting": "csc"}.get(role)


# ---- the euro: the NBU's rate, kept by day --------------------------------------------------

_RATES = [None]


def eur_rate(day):
    """UAH for one euro on that day (the NBU's official rate), cached in data/eur.json."""
    day = (day or date.today().isoformat())[:10]
    path = os.path.join(DATA, "eur.json")
    if _RATES[0] is None:
        try:
            with open(path, encoding="utf-8") as f:
                _RATES[0] = json.load(f)
        except (OSError, ValueError):
            _RATES[0] = {}
    rates = _RATES[0]
    if day in rates:
        return rates[day]
    try:
        url = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&date=%s&json" % day.replace("-", "")
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20) as r:
            rate = float(json.load(r)[0]["rate"])
    except Exception:  # noqa: BLE001 — without the rate the euro thresholds are left out
        near = sorted(rates, key=lambda k: abs((_d(k) - _d(day)).days))
        return rates[near[0]] if near and abs((_d(near[0]) - _d(day)).days) <= 31 else None
    rates[day] = rate
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(dict(sorted(rates.items())), f, separators=(",", ":"))
    except OSError:
        pass
    return rate


def _eur(value, day):
    """A value {amount, vat} in euro without VAT, or None."""
    if not value or not value.get("amount"):
        return None
    if (value.get("currency") or "UAH") == "EUR":
        amount = value["amount"]
    else:
        rate = eur_rate(day)
        if not rate:
            return None
        amount = value["amount"] / rate
    return round(amount / 1.2 if value.get("vat") else amount, 2)


# ---- the winner's open contracts in the programme ------------------------------------------

_EIB = [None]


def _eib_rows():
    if _EIB[0] is None:
        try:
            with open(os.path.join(DATA, "eib.json"), encoding="utf-8") as f:
                _EIB[0] = json.load(f).get("items") or []
        except (OSError, ValueError):
            _EIB[0] = []
    return _EIB[0]


def open_programme_contracts(code, on_day, own_tid, with_urp3=True):
    """The supplier's recovery-programme contracts signed before `on_day` and not finished then, at
    their initial price (its winning bid), as the model TD's form in Annex 10 lists them. The earlier
    editions count only НКПВУ and ПВУ contracts (with_urp3=False)."""
    out = []
    for t in _eib_rows():
        if t.get("tid") == own_tid or NOT_PROGRAMME.search(t.get("title") or ""):
            continue
        if not with_urp3 and programme(t)[0] == "urp3":
            continue
        for c in t.get("contracts") or []:
            if code not in [s.get("code") for s in c.get("suppliers") or []]:
                continue
            signed, st = c.get("signed"), c.get("status")
            if not signed or signed > on_day or st in ("cancelled", "pending"):
                continue
            if st != "active" and (c.get("end") or "") < on_day:
                continue  # finished (or ended) before the bids were in
            won = next((a.get("amount") for a in t.get("awards") or [] if a.get("status") == "active" and a.get("supplier_code") == code
                        and (not c.get("lot") or not a.get("lot") or a.get("lot") == c.get("lot"))), None)
            first = won or (c.get("value") or {}).get("amount")
            if first:
                out.append({"tid": t.get("tid"), "number": c.get("number") or "", "signed": signed, "value": round(first, 2), "status": st})
    return sorted(out, key=lambda x: x["signed"])


# ---- the checks -----------------------------------------------------------------------------

def _guarantee(t, lot):
    if lot and (t.get("lot_guarantee") or {}).get(lot) is not None:
        return t["lot_guarantee"][lot], (t.get("lot_value") or {}).get(lot) or (t.get("value") or {}).get("amount")
    return (t.get("guarantee") or {}).get("amount"), (t.get("value") or {}).get("amount")


def _award(t, c):
    code = ((c or {}).get("suppliers") or [{}])[0].get("code")
    act = [a for a in t.get("awards") or [] if a.get("status") == "active"]
    for a in act:
        if (not (c or {}).get("lot") or not a.get("lot") or a.get("lot") == c.get("lot")) and (not code or a.get("supplier_code") == code):
            return a
    return act[-1] if act and not c else None


def _people(items, code):
    e = (items.get(code) or {}).get("edr") or {}
    return set(e.get("founders") or []) | set(e.get("beneficiaries") or []) | set(e.get("signers") or []), set(e.get("founder_codes") or [])


def items(rl):
    """The checks of a card's "rules" (a list in snapshots made before the editions were told apart)."""
    return (rl.get("items") if isinstance(rl, dict) else rl) or []


def check(t, c=None, related=None, advance=None, acts=None, paid_total=None, legal_items=None, profile=None, docs=None,
          contract_stage=True, subv=None):
    """The programme's rules for procurement `t` and contract `c`:
    {edition, programme, tranche, strict, items: [{key, st, level, p}]}."""
    k = kind(t)
    if not k:
        return None
    out = []
    ed_key, prog, tranche, strict = edition(t, subv)
    ed = EDITIONS[ed_key]

    def put(key, st, level="medium", law=False, **p):
        if st == "bad" and not strict and not law:
            st, p["older" if prog else "unknown"] = "check", ed["from"]
        out.append({"key": key, "st": st, "level": level if st in ("bad", "check") else None, "p": {x: v for x, v in p.items() if v is not None}})

    method, lot = t.get("method") or "", (c or {}).get("lot")
    day = t.get("date") or t.get("tender_start")
    expected = t.get("value") or {}
    eur = _eur(expected, day)

    # 1. The procedure: international from the bank's thresholds; non-competitive only with its no-objection.
    if method in NON_COMPETITIVE:
        small = k in ("ts", "csc") and eur is not None and eur < 50_000
        put("method", "check", "low" if small else "medium", kind=k, method=method, eur=eur, small=small or None)
    elif eur is not None and eur >= INTL_EUR[k]:
        put("method", "ok" if method in INTERNATIONAL else "check", "high", kind=k, method=method, eur=eur, limit=INTL_EUR[k])
    elif method:
        put("method", "ok", kind=k, method=method, eur=eur, limit=INTL_EUR[k])

    # 2. The tender period: at least 20 days for works, 15 for supervision and the consulting engineer.
    if method in OPEN:
        n = _days(t.get("tender_start") or t.get("date"), t.get("deadline"))
        if n is not None:
            need = ed.get("min_days", MIN_DAYS)[k]
            put("period", "ok" if n >= need else "bad", "high", days=n, min=need)

    # 3. Bid security for works: required, a bank guarantee of at most 0.5% of the expected value.
    if k == "works" and method in OPEN and not (t.get("lots") and "lot_guarantee" not in t):
        g, base = _guarantee(t, lot)
        if not g:
            # Mandatory under ПВУ ІІІ; under ПВУ and НКПВУ the buyer's choice.
            put("bid_security", "bad" if ed["bid_security"] else "ok", "medium", max=BID_SECURITY_MAX, optional=not ed["bid_security"] or None)
        else:
            pct = round(g / base * 100, 2) if base else None
            put("bid_security", "bad" if pct and pct > BID_SECURITY_MAX + 0.005 else "ok", "medium", law=True, amount=g, pct=pct, max=BID_SECURITY_MAX)

    # 4. Signing: not sooner than 5 days after the intent notice, not later than 15.
    a = _award(t, c)
    if method in OPEN and a and a.get("date") and (c or {}).get("signed"):
        n = _days(a["date"], c["signed"])
        single = (t.get("bids") or 0) <= 1
        complained = any(x.get("of") == "award" for x in t.get("complaints") or [])
        # Above the EU thresholds the law asks for 10 days (Art. 33), otherwise 5 (the Особливості).
        least = STANDSTILL_EU if method == "aboveThresholdEU" else STANDSTILL[0]
        if n is not None and n < least:
            put("standstill", "check" if single else "bad", "low" if single else "medium", law=True, days=n, award=a["date"], signed=c["signed"], single=single or None)
        elif n is not None and n > STANDSTILL[1] and not complained:
            put("standstill", "check", "low", days=n, award=a["date"], signed=c["signed"], late=True)
        elif n is not None:
            put("standstill", "ok", days=n, award=a["date"], signed=c["signed"])

    sup = ((c or {}).get("suppliers") or [{}])[0]
    code = sup.get("code") or ""
    items = legal_items or {}

    if k == "works" and related is not None:
        live = [r for r in related if r.get("status") not in ("cancelled", "unsuccessful")]
        works_value = ((c or {}).get("value") or {}).get("amount") or expected.get("amount")
        works_eur = _eur(dict((c or {}).get("value") or expected), (c or {}).get("signed") or day)
        for role, key in (("supervision", "ts"), ("consulting", "csc")):
            mine = [r for r in live if r.get("role") == role or (key == "csc" and CSC_TITLE.search(r.get("title") or ""))]
            # 5. Technical supervision for every sub-project; the consulting engineer from €3M.
            need = key == "ts" or (works_eur is not None and works_eur >= CSC_FROM_EUR)
            if not mine:
                if need:
                    put(key + "_present", "check" if key == "ts" else "bad", "medium", eur=works_eur, limit=CSC_FROM_EUR if key == "csc" else None)
                continue
            put(key + "_present", "ok", tids=[r.get("tid") for r in mine][:3], eur=works_eur)
            # 6. Its price: at most 1.5% (TS) or 2% (CSC; 3% under ПВУ and НКПВУ) of chapters 1–9 of the estimate.
            v = sum(((r.get("value") or {}).get("amount") or 0) for r in mine)
            if works_value and v and contract_stage:
                pct = round(v / works_value * 100, 2)
                top = SHARE_MAX[key] if key == "ts" else ed["csc_max"]
                put(key + "_share", "check" if pct > top else "ok", "medium", amount=round(v, 2), pct=pct, max=top)
            # 7. Independent of the contractor: not the same company, no shared founder or beneficiary.
            if code and contract_stage:
                who = {}
                for r in mine:
                    sup_ = r.get("supplier") or {}
                    sc = sup_.get("code")
                    if not sc or sc in who:
                        continue
                    if sc == code:
                        st_ = "same"
                    elif (items.get(sc) or {}).get("edr") and (items.get(code) or {}).get("edr"):
                        pa, ca = _people(items, sc)
                        pb, cb = _people(items, code)
                        st_ = "linked" if (pa & pb or sc in cb or code in ca or ca & cb) else "ok"
                    else:
                        st_ = "nodata"
                    who[sc] = {"name": sup_.get("name"), "code": sc, "tid": r.get("tid"), "st": st_}
                if who:
                    sts = {w["st"] for w in who.values()}
                    put(key + "_independent", "bad" if sts & {"same", "linked"} else "check" if "nodata" in sts else "ok",
                        "high" if sts & {"same", "linked"} else "low", who=list(who.values()))

    if k == "works" and contract_stage and code:
        on_day = t.get("deadline") or (c or {}).get("signed") or day
        # 8. Experience: years in construction (2, or 4 under the earlier editions) and similar contracts.
        reg = ((items.get(code) or {}).get("edr") or {}).get("registered")
        if reg and on_day:
            yrs = round(_days(reg, on_day) / 365.25, 1) if _days(reg, on_day) is not None else None
            if yrs is not None:
                put("age", "check" if yrs < ed["years"] else "ok", "medium", years=yrs, registered=reg, min=ed["years"])
        # In a procedure of several lots the share is of the contract's own lot.
        base = (t.get("lot_value") or {}).get(lot) if lot else None
        base = base or expected.get("amount")
        sim = ed["similar"]
        if not sim.get("share"):
            # The earlier editions ask for N similar contracts in so many years, at any price.
            put("similar", "check", "low", n=sim["n"], within=sim["within"], count_only=True)
        elif profile and profile.get("top") is not None and base:
            lo = (_d(on_day) - timedelta(days=7 * 365)).isoformat() if _d(on_day) else ""
            prior = [x for x in profile["top"] if not str(x.get("cid") or "").startswith(t.get("tid") or "~")
                     and (x.get("day") or "") >= lo and (x.get("day") or "") <= on_day and x.get("status") != "cancelled"]
            best = max(prior, key=lambda x: x.get("value") or 0, default=None)
            need = round(base * sim["share"], 2)
            ok = best and (best.get("value") or 0) >= need
            put("similar", "ok" if ok else "check", "medium", need=need, best=(best or {}).get("value"), cid=(best or {}).get("cid"))
        # 9. Overload: average turnover (5 years; 2 under ПВУ/НКПВУ) ≥ 50% of the initial price of open
        # programme contracts (НКПВУ and ПВУ; ПВУ ІІІ too in the 2026 edition).
        if on_day:
            open_ = open_programme_contracts(code, on_day, t.get("tid"), ed["load"]["urp3"])
            total = round(sum(x["value"] for x in open_), 2)
            need = round(total * LOAD_SHARE, 2)
            avg = (profile or {}).get("avg_year")
            low = bool(total) and avg is not None and avg < need
            put("overload", "check", "medium" if low else "low", n=len(open_), total=total, need=need, avg=avg,
                on=on_day, years=ed["load"]["years"], urp3=ed["load"]["urp3"] or None, list=open_[:12] or None)
        # Tranche B: participants registered in the EU, Ukraine, the Western Balkans, Georgia, Moldova, the EEA.
        if tranche != "A" and prog in ("urp3", None) and not re.fullmatch(r"\d{8}|\d{10}", code):
            put("eligibility", "check", "medium", code=code)

    if contract_stage and c:
        # 10. Both pacts in the bid and the contract.
        titles = " ".join(d.get("title") or "" for d in docs or [])
        both = bool(INTEGRITY.search(titles)) and bool(ES_PACT.search(titles))
        put("pacts", "ok" if both else "check", "low", integrity=bool(INTEGRITY.search(titles)), es=bool(ES_PACT.search(titles)))
        value = ((c.get("value") or {}).get("amount")) or 0
        # 11. The advance: a bank guarantee for all of it, valid until acts close it and 30 days more.
        if advance and advance.get("sum"):
            got, closed = 0.0, None
            for x in sorted(acts or [], key=lambda x: x.get("date") or ""):
                got += x.get("amount") or 0
                if got >= advance["sum"] - 1:
                    closed = x.get("date")
                    break
            # The 2026 edition: valid until the advance is closed and 30 days more; before, as the contract says.
            until = (_d(closed) + timedelta(days=GUARANTEE_DAYS)).isoformat() if _d(closed) and ed.get("advance_30") else None
            put("advance_guarantee", "check", "low", sum=advance["sum"], pct=advance.get("pct"), closed=closed, until=until,
                covered=round(min(got, advance["sum"]) / advance["sum"] * 100) if advance["sum"] else None, by_contract=not ed.get("advance_30") or None)
        # 12. The last 5%: only after the declaration of readiness is registered.
        if value and paid_total and paid_total / value * 100 >= FINAL_PCT:
            put("final_payment", "check", "medium", pct=round(paid_total / value * 100, 1))
    return {"edition": ed_key, "programme": prog, "tranche": tranche, "strict": strict, "items": out}


def worst(rl):
    """For the matrix: (high reasons, medium reasons) from the checks the data show as broken."""
    checks = items(rl)
    hi = sorted({"rule_" + x["key"] for x in checks if x["st"] == "bad" and x["level"] == "high"})
    md = sorted({"rule_" + x["key"] for x in checks if x["st"] == "bad" and x["level"] == "medium"})
    return hi, md
