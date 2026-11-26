"""Contract-level reconciliation and risk signals for a compliance analyst.

For every contract of a tracked organisation it puts side by side what the
portal holds: the contract value (adjusted by addendums), the acts signed
under it and the Treasury payments that name it in the payment purpose.
Mismatches become *signals*: things an analyst should look at, not verdicts.

Thresholds follow the Law of Ukraine "On Public Procurement" (No. 922-VIII):
open procedures from UAH 200,000 for goods and services and UAH 1,500,000 for
works; a price increase through an addendum is capped at 10% (art. 41). The
publication deadline of 5 working days is from the Law "On Openness of the Use
of Public Funds". Martial-law procurement rules have many exceptions, which is
why every signal is worded as "check", never as "violation".
"""
import re
from collections import defaultdict
from datetime import date, timedelta

GOODS_THRESHOLD = 200_000
WORKS_THRESHOLD = 1_500_000
PRICE_UP_LIMIT = 0.10
PUBLISH_WORKDAYS = 5
SPLIT_WINDOW_DAYS = 30
CONCENTRATION_SHARE = 0.30
# Economic classification codes of purchases (goods, services, utilities, capital).
PURCHASE_KEKV = re.compile(r"^(22[1-8]\d|2240|2250|2272|2273|2274|2275|2276|2282|31\d\d|3132|3142)$")

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}
PZ_MISMATCH = 0.01  # Prozorro and Treasury prices of one contract may differ by 1%
# A payment funded through the EIB (its sub-loans and the recovery programmes it finances).
# The bank's name is typed with a Latin "I" as often as with a Cyrillic one ("ЄIБ"), and shortened
# ("Євр.Інвест.Банк").
EIB_TX = re.compile(r"(Є[ІI]Б|Е[ІI]Б|\bEIB\b|НКПВУ|\bПВУ\b|європейськ\w*\s+інвестиційн\w*\s+банк|євр\.?\s*[іi]нвест\.?\s*банк)", re.IGNORECASE)

# How a payment purpose names its contract, as the buyers type it:
#   "дог.№127 від 16.06.2026", "договір №23/12-5 від 26.01.26", "Договiр№18-19/ЗВвiд19.04.19" (Latin i),
#   "Д.9-25/П в09.05.25", "Д.45-23/Пв.10.11.23", "Дог188 вiд180924" (DDMMYY run together),
#   "Дог.№14(02.03.26)", "дог№4/30.05.25", "д4/26.01.26", "дог.№18/OD04A_01_ W вiд14.02.24",
#   "дог. №112 від 29 травня 2026 року".
_MONTHS = {"січ": 1, "лют": 2, "берез": 3, "квіт": 4, "трав": 5, "черв": 6, "лип": 7, "серп": 8, "верес": 9, "жовт": 10, "листоп": 11, "груд": 12}
_CREF_HEAD = r"(?:(?<![а-яіїєґa-z])(?:дог(?:ов[іiо]р[ау]?)?|договор[ау]?)\s*\.?|(?<![а-яіїєґa-z])д\.(?=\s*(?:№|\d))|(?<![а-яіїєґa-z])д(?=\d|№))"
_CREF_NUM = r"\s*(?:№|N|#)?\s*([0-9A-Za-zА-Яа-яІіЇїЄєҐґ](?:[0-9A-Za-zА-Яа-яІіЇїЄєҐґ/\-_.]|[_/\-]\s(?=[A-Za-zА-Яа-я])){0,40}?)"
CONTRACT_REF = re.compile(
    _CREF_HEAD + _CREF_NUM + r"\s*\.?\s*"
    r"(?:(?:від|вiд|вид|от|в[іi]д\.|в\.?)\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})"   # від 16.06.2026, в09.05.25
    r"|(?:від|вiд)\s*(\d{2})(\d{2})(\d{2})(?!\d)"                                     # вiд180924
    r"|\(\s*(\d{1,2})\.(\d{1,2})\.(\d{2,4})\s*\)"                                     # (02.03.26)
    r"|/(\d{1,2})\.(\d{1,2})\.(\d{2,4})"                                                 # /30.05.25
    r"|(?:від|вiд)\s*(\d{1,2})\s+([а-яіїє]+)\s+(\d{4}))",                               # від 29 травня 2026
    re.IGNORECASE,
)


def _day(value):
    try:
        return date.fromisoformat((value or "")[:10])
    except ValueError:
        return None


# Contract and act numbers are typed by hand: Latin letters that look Cyrillic, and "З" for "3".
LOOKALIKE = str.maketrans("aceiopxykmhtbз", "асеіорхукмнтв3")


def _norm_number(value):
    return re.sub(r"[\s.№#]+", "", str(value or "")).lower().translate(LOOKALIKE).rstrip("-/")


def norm_tid(value):
    """A Prozorro id as the Treasury keeps it ("UA-2023-10-18-007682-а" with a Cyrillic "а"),
    or "" when the value is not one."""
    v = re.sub(r"\s+", "", str(value or "")).upper().translate(str.maketrans("АСЕІОРХ", "ACEIOPX"))
    m = re.match(r"^UA-\d{4}-\d{2}-\d{2}-\d{6}-[A-Z]$", v)
    return v if m else ""


def _norm_name(value):
    text = re.sub(r"[\"'«»“”„()]", " ", str(value or "").lower())
    text = re.sub(r"\b(фоп|тов|пп|кп|комунальне|підприємство|товариство|з|обмеженою|відповідальністю|приватне|ат|прат|пат)\b", " ", text)
    return [w for w in re.split(r"[\s.,]+", text) if len(w) > 2]


def _same_party(code_a, name_a, code_b, name_b):
    """Codes win when both are real; otherwise compare the first meaningful name word."""
    real_a = bool(code_a) and str(code_a).isdigit()
    real_b = bool(code_b) and str(code_b).isdigit()
    if real_a and real_b:
        return code_a == code_b
    wa, wb = _norm_name(name_a), _norm_name(name_b)
    return bool(wa and wb and wa[0] == wb[0])


def _workdays_between(start, end):
    if not start or not end or end <= start:
        return 0
    days, cur = 0, start
    while cur < end:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            days += 1
    return days


def parse_contract_refs(details):
    """Contract (number, date) pairs named in a payment purpose."""
    refs = []
    for m in CONTRACT_REF.finditer(details or ""):
        g = m.groups()
        try:
            if g[13]:  # a month by name
                month = next((n for k, n in _MONTHS.items() if g[14].lower().startswith(k)), None)
                if not month:
                    continue
                day, year = int(g[13]), int(g[15])
            else:
                day, month, year = next((int(g[i]), int(g[i + 1]), int(g[i + 2])) for i in (1, 4, 7, 10) if g[i])
            if year < 100:
                year += 2000
            refs.append((_norm_number(g[0]), date(year, month, day)))
        except (ValueError, StopIteration):
            continue
    return refs


def _money(x):
    return round(float(x or 0), 2)


def apply_addendums(c):
    """The contract value after its addendums (type 1 raises, 0 lowers the price).

    An addendum's `amount` is normally the new full price. Some disposers put only
    the change there: when `amount` equals the change and is under half the original
    price, it is applied as a change, not as the new price.
    """
    c["value"], c["price_up"] = c["value0"], 0.0
    for a in c["addendums"]:
        delta = abs(a.get("delta") or 0)
        if a.get("type") in (0, 1) and a.get("amount"):
            if delta and abs(a["amount"] - delta) < 1.0 and a["amount"] < c["value0"] * 0.5:
                c["value"] = _money(c["value"] + (delta if a["type"] == 1 else -delta))
                a["as_delta"] = True
            else:
                c["value"] = a["amount"]  # an addendum restates the contract value
        if a.get("type") == 1:
            c["price_up"] += delta
    return c


def _signal(kind, severity, params, contract=None, amount=None, ext_ids=None):
    # Signals carry numbers, not prose: the site words them in the reader's language.
    return {
        "type": kind, "severity": severity, "params": params,
        "contract": contract["id"] if contract else None,
        "date": (contract or {}).get("date"),
        "party": (contract or {}).get("party_name"),
        "amount": amount, "ext_ids": ext_ids or [],
    }


def contract_checks(c):
    """Flags and signals of one Treasury contract (value, acts, payments, addendums)."""
    flags, signals = [], []
    value = c["value"]
    tol = max(1.0, value * 0.001)
    works = (c.get("cpv") or "").startswith("45")
    threshold = WORKS_THRESHOLD if works else GOODS_THRESHOLD
    if value and c["paid"] > value + tol:
        flags.append("overpaid")
        signals.append(_signal("overpaid", "high", {"paid": c["paid"], "value": value},
                               c, _money(c["paid"] - value), [p.get("ext_id") for p in c["payments"]]))
    if value and c["acts_sum"] > value + tol:
        flags.append("acts_over")
        signals.append(_signal("acts_over", "medium", {"acts": c["acts_sum"], "value": value}, c, _money(c["acts_sum"] - value)))
    if c.get("price_up") and c.get("value0"):
        share = c["price_up"] / c["value0"]
        flags.append("price_up")
        signals.append(_signal("price_up", "high" if share > PRICE_UP_LIMIT else "medium",
                               {"delta": c["price_up"], "pct": round(share * 100, 1), "value0": c["value0"]},
                               c, c["price_up"], [a.get("ext_id") for a in c["addendums"] if a.get("type") == 1]))
    if c.get("role") == "disposer" and not c.get("tender") and not c.get("prozorro") and value >= threshold:
        flags.append("no_tender")
        signals.append(_signal("no_tender", "medium", {"value": value, "threshold": threshold, "works": works, "reason": c.get("reason") or ""}, c, value))
    first_pay = c["payments"][0]["date"] if c["payments"] else None
    if first_pay and c.get("date") and first_pay < c["date"]:
        flags.append("paid_before")
        signals.append(_signal("paid_before", "medium", {"first_pay": first_pay, "date": c["date"]}, c, None, [c["payments"][0].get("ext_id")]))
    late = _workdays_between(_day(c.get("date")), _day(c.get("published")))
    c["late_days"] = late
    if c.get("role") == "disposer" and late > PUBLISH_WORKDAYS:
        flags.append("late")  # in an organisation's report summarised as one line, not per contract
    if c.get("role") == "disposer" and c["acts_sum"] and c["paid"] > c["acts_sum"] + max(1000, c["acts_sum"] * 0.05):
        flags.append("paid_over_acts")
        signals.append(_signal("paid_over_acts", "low", {"paid": c["paid"], "acts": c["acts_sum"]}, c, _money(c["paid"] - c["acts_sum"])))
    return flags, signals


def pz_mismatch(c, pz_value):
    """Prozorro holds the current price; the Treasury's, after addendums, should agree within 1%."""
    if not pz_value or not c.get("value"):
        return None
    if abs(pz_value - c["value"]) <= pz_value * PZ_MISMATCH:
        return None
    return _signal("pz_treasury_mismatch", "low", {"pz": _money(pz_value), "treasury": _money(c["value"])},
                   c, _money(abs(pz_value - c["value"])))


def analyze(items, org_edrpou):
    """Build {contracts, signals, totals} from an organisation's stored records."""
    by_kind = defaultdict(list)
    for item in items:
        by_kind[item["kind"]].append(item)

    contracts = {}
    for item in by_kind["contract"]:
        d = item["data"]
        role = item["role"]
        people = d.get("contractors") or []
        first = people[0] if people else {}
        if role == "disposer":
            party_code, party_name = first.get("identifier"), first.get("name")
        else:
            party_code, party_name = d.get("edrpou"), item.get("cp_name")
        cpv = ((d.get("procurementItems") or [{}])[0] or {}).get("cpvCode") or (
            (d.get("specifications") or [{}])[0] or {}).get("cpvCode") or ""
        contracts[str(d.get("id"))] = {
            "id": str(d.get("id")),
            "ext_id": item["ext_id"],
            "role": role,
            "number": d.get("documentNumber") or "",
            "date": (d.get("documentDate") or "")[:10] or None,
            "published": (d.get("signDate") or "")[:10] or None,
            "from": (d.get("fromDate") or "")[:10] or None,
            "to": None if d.get("noTerm") else ((d.get("toDate") or "")[:10] or None),
            "party_code": party_code if party_code != "HIDDEN" else None,
            "party_name": party_name or "",
            "party_type": first.get("contractorType"),
            "subject": d.get("subject") or "",
            "cpv": cpv,
            "currency": d.get("currency") or "UAH",
            "value0": _money(d.get("amount")),
            "value": _money(d.get("amount")),
            "tender": bool(d.get("tender")),
            "reason": d.get("reason") or "",
            "prozorro": d.get("idTenderProzorro") or "",
            "addendums": [], "acts": [], "payments": [],
            "price_up": 0.0,
        }

    for kind, key in (("addendum", "addendums"), ("act", "acts")):
        for item in by_kind[kind]:
            d = item["data"]
            c = contracts.get(str(d.get("parentId")))
            if not c:
                continue
            # documentDate is the act's (addendum's) own date; signDate is when it was signed for
            # the portal, i.e. published.
            entry = {"ext_id": item["ext_id"], "date": (d.get("documentDate") or d.get("signDate") or "")[:10],
                     "published": (d.get("signDate") or "")[:10] or None,
                     "number": d.get("documentNumber") or "", "amount": _money(d.get("amount"))}
            if kind == "addendum":
                entry["type"] = d.get("correctionType")
                entry["delta"] = _money(d.get("amountIncrease"))
            c[key].append(entry)

    for c in contracts.values():
        c["addendums"].sort(key=lambda a: a["date"] or "")
        c["acts"].sort(key=lambda a: a["date"] or "")
        apply_addendums(c)

    # Index contracts by normalised number for payment matching.
    by_number = defaultdict(list)
    for c in contracts.values():
        if c["number"]:
            by_number[_norm_number(c["number"])].append(c)

    unmatched = defaultdict(lambda: {"count": 0, "sum": 0.0, "name": "", "code": "", "ext_ids": [], "refs": []})
    matched_count = 0
    payments = by_kind["transaction"]
    for item in payments:
        d = item["data"]
        outgoing = item["role"] == "payer"
        other_code = d.get("recipt_edrpou") if outgoing else d.get("payer_edrpou")
        other_name = d.get("recipt_name") if outgoing else d.get("payer_name")
        want_role = "disposer" if outgoing else "contractor"
        hit = None
        refs = parse_contract_refs(d.get("payment_details"))
        for number, day in refs:
            # Numbers repeat across years and suppliers, so the contract date
            # named in the payment must match; the party only breaks ties.
            dated = [c for c in by_number.get(number, []) if c["role"] == want_role and c["date"] == day.isoformat()]
            party = [c for c in dated if _same_party(other_code, other_name, c["party_code"], c["party_name"])]
            if party or len(dated) == 1:
                hit = (party or dated)[0]
                break
        if hit:
            matched_count += 1
            hit["payments"].append({"ext_id": item["ext_id"], "date": item.get("date"), "amount": _money(item.get("amount"))})
            if EIB_TX.search(d.get("payment_details") or ""):
                hit["eib_tx"] = True
        elif outgoing and PURCHASE_KEKV.match(str(d.get("kekv") or "")):
            key = other_code if other_code and str(other_code).isdigit() else (other_name or "?")
            u = unmatched[key]
            u["count"] += 1
            u["sum"] += float(item.get("amount") or 0)
            u["name"], u["code"] = other_name or "", other_code if str(other_code or "").isdigit() else ""
            u["ext_ids"].append(item["ext_id"])
            for number, day in refs:
                label = "№%s · %s" % (number, day.strftime("%d.%m.%Y"))
                if label not in u["refs"]:
                    u["refs"].append(label)

    signals = []

    def signal(kind, severity, params, contract=None, amount=None, ext_ids=None):
        signals.append(_signal(kind, severity, params, contract, amount, ext_ids))

    for c in contracts.values():
        c["acts_sum"] = _money(sum(a["amount"] for a in c["acts"]))
        c["paid"] = _money(sum(p["amount"] for p in c["payments"]))
        c["payments"].sort(key=lambda p: p["date"] or "")
        flags, found = contract_checks(c)
        signals.extend(found)
        c["flags"] = flags

    # Possible splitting: one supplier, one CPV group, 30 days, each below the threshold.
    groups = defaultdict(list)
    for c in contracts.values():
        if c["role"] != "disposer" or c["tender"] or c["prozorro"] or not c["date"]:
            continue
        who = c["party_code"] or " ".join(_norm_name(c["party_name"])[:1])
        if not who:
            continue
        groups[(who, c["cpv"][:4])].append(c)
    for (_, cpv4), group in groups.items():
        group.sort(key=lambda c: c["date"])
        start = 0
        for end in range(len(group)):
            while _day(group[end]["date"]) - _day(group[start]["date"]) > timedelta(days=SPLIT_WINDOW_DAYS):
                start += 1
            window = group[start:end + 1]
            works = cpv4.startswith("45")
            threshold = WORKS_THRESHOLD if works else GOODS_THRESHOLD
            total = sum(c["value"] for c in window)
            if len(window) >= 2 and total >= threshold and all(c["value"] < threshold for c in window):
                lead = window[-1]
                if "split" in lead["flags"]:
                    continue
                for c in window:
                    if "split" not in c["flags"]:
                        c["flags"].append("split")
                signal("split", "medium", {"n": len(window), "cpv": cpv4, "days": SPLIT_WINDOW_DAYS,
                                           "total": _money(total), "threshold": threshold},
                       lead, _money(total), [c["ext_id"] for c in window])
                break

    late = [c for c in contracts.values() if "late" in c["flags"]]
    if late:
        recent = sorted(late, key=lambda c: c["published"] or "", reverse=True)
        median = sorted(c["late_days"] for c in late)[len(late) // 2]
        signals.append({
            "type": "late", "severity": "low",
            "params": {"n": len(late), "total": sum(1 for c in contracts.values() if c["role"] == "disposer"), "median": median},
            "contract": None, "date": recent[0]["published"], "party": None,
            "amount": None, "ext_ids": [c["ext_id"] for c in recent[:200]],
        })

    for key, u in unmatched.items():
        if u["sum"] < 1000:
            continue
        signals.append({
            "type": "no_contract", "severity": "medium" if u["sum"] >= 50_000 else "low",
            "params": {"count": u["count"], "sum": _money(u["sum"]), "refs": u["refs"][:5]},
            "contract": None, "date": None, "party": u["name"], "party_code": u["code"],
            "amount": _money(u["sum"]), "ext_ids": u["ext_ids"][:200],
        })

    # Concentration: one supplier holds a large share of what the organisation contracted.
    totals_by_party = defaultdict(float)
    for c in contracts.values():
        if c["role"] == "disposer":
            totals_by_party[c["party_code"] or c["party_name"]] += c["value"]
    grand = sum(totals_by_party.values())
    if grand and len(totals_by_party) > 2:
        for party, amount in sorted(totals_by_party.items(), key=lambda kv: -kv[1])[:3]:
            if amount / grand >= CONCENTRATION_SHARE:
                name = next((c["party_name"] for c in contracts.values() if (c["party_code"] or c["party_name"]) == party), party)
                signals.append({
                    "type": "concentration", "severity": "low",
                    "params": {"pct": round(amount / grand * 100), "amount": _money(amount), "grand": _money(grand)},
                    "contract": None, "date": None, "party": name, "amount": _money(amount), "ext_ids": [],
                })

    signals.sort(key=lambda s: (SEVERITY_ORDER[s["severity"]], -(s["amount"] or 0)))
    counts = defaultdict(int)
    for s in signals:
        counts[s["severity"]] += 1

    disposer = [c for c in contracts.values() if c["role"] == "disposer"]
    supplier = [c for c in contracts.values() if c["role"] == "contractor"]
    rows = sorted(contracts.values(), key=lambda c: (c["date"] or "", c["number"]), reverse=True)
    return {
        "contracts": [_row(c) for c in rows],
        "signals": signals,
        "counts": dict(counts),
        "totals": {
            "contracts": len(disposer),
            "value": _money(sum(c["value"] for c in disposer)),
            "acts": _money(sum(c["acts_sum"] for c in disposer)),
            "paid": _money(sum(c["paid"] for c in disposer)),
            "payments": len(payments),
            "matched": matched_count,
            "unmatched_sum": _money(sum(u["sum"] for u in unmatched.values())),
            # The same for contracts where the organisation is the supplier.
            "as_supplier": {
                "contracts": len(supplier),
                "value": _money(sum(c["value"] for c in supplier)),
                "acts": _money(sum(c["acts_sum"] for c in supplier)),
                "paid": _money(sum(c["paid"] for c in supplier)),
            },
        },
    }


def _row(c):
    keep = ("id", "ext_id", "role", "number", "date", "published", "from", "to", "party_code", "party_name",
            "party_type", "subject", "cpv", "currency", "value0", "value", "price_up", "tender", "reason",
            "prozorro", "acts_sum", "paid", "flags", "late_days", "addendums", "acts", "payments")
    row = {k: c[k] for k in keep}
    if c.get("eib_tx"):
        row["eib_tx"] = True
    return row
