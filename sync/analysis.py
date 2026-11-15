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

# "дог.№127 від 16.06.2026", "договір №23/12-5 від 26.01.26", "дог №51/18 вiд 01.01.2026"
CONTRACT_REF = re.compile(
    r"(?:дог(?:ов[іо]р[ау]?|\.)?|договор[ау]?)\s*\.?\s*(?:№|N|#)?\s*"
    r"([0-9A-Za-zА-Яа-яІіЇїЄєҐґ][0-9A-Za-zА-Яа-яІіЇїЄєҐґ/\-_.]*?)\s*\.?\s*"
    r"(?:від|вiд|вид|от|в[іi]д\.)\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})",
    re.IGNORECASE,
)


def _day(value):
    try:
        return date.fromisoformat((value or "")[:10])
    except ValueError:
        return None


def _norm_number(value):
    return re.sub(r"[\s.№#]+", "", str(value or "")).lower().rstrip("-/")


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
        day, month, year = int(m.group(2)), int(m.group(3)), int(m.group(4))
        if year < 100:
            year += 2000
        try:
            refs.append((_norm_number(m.group(1)), date(year, month, day)))
        except ValueError:
            continue
    return refs


def _money(x):
    return round(float(x or 0), 2)


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
            entry = {"ext_id": item["ext_id"], "date": (d.get("signDate") or d.get("documentDate") or "")[:10],
                     "number": d.get("documentNumber") or "", "amount": _money(d.get("amount"))}
            if kind == "addendum":
                entry["type"] = d.get("correctionType")
                entry["delta"] = _money(d.get("amountIncrease"))
            c[key].append(entry)

    for c in contracts.values():
        c["addendums"].sort(key=lambda a: a["date"] or "")
        c["acts"].sort(key=lambda a: a["date"] or "")
        for a in c["addendums"]:
            if a["type"] in (0, 1) and a["amount"]:
                c["value"] = a["amount"]  # an addendum restates the contract value
            if a["type"] == 1:
                c["price_up"] += a["delta"]

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
        elif outgoing and PURCHASE_KEKV.match(str(d.get("kekv") or "")):
            key = other_code if other_code and str(other_code).isdigit() else (other_name or "?")
            u = unmatched[key]
            u["count"] += 1
            u["sum"] += float(item.get("amount") or 0)
            u["name"], u["code"] = other_name or "", other_code if str(other_code or "").isdigit() else ""
            u["ext_ids"].append(item["ext_id"])
            for number, day in refs:
                label = "№%s від %s" % (number, day.strftime("%d.%m.%Y"))
                if label not in u["refs"]:
                    u["refs"].append(label)

    signals = []

    def signal(kind, severity, title, text, contract=None, amount=None, ext_ids=None):
        signals.append({
            "type": kind, "severity": severity, "title": title, "text": text,
            "contract": contract["id"] if contract else None,
            "date": (contract or {}).get("date"),
            "party": (contract or {}).get("party_name"),
            "amount": amount, "ext_ids": ext_ids or [],
        })

    for c in contracts.values():
        c["acts_sum"] = _money(sum(a["amount"] for a in c["acts"]))
        c["paid"] = _money(sum(p["amount"] for p in c["payments"]))
        c["payments"].sort(key=lambda p: p["date"] or "")
        value, flags = c["value"], []
        tol = max(1.0, value * 0.001)
        works = c["cpv"].startswith("45")
        threshold = WORKS_THRESHOLD if works else GOODS_THRESHOLD

        if value and c["paid"] > value + tol:
            flags.append("overpaid")
            signal("overpaid", "high", "Оплачено больше суммы договора",
                   "Платежи по договору — %s грн при цене договора %s грн." % (_fmt(c["paid"]), _fmt(value)),
                   c, _money(c["paid"] - value), [p["ext_id"] for p in c["payments"]])
        if value and c["acts_sum"] > value + tol:
            flags.append("acts_over")
            signal("acts_over", "medium", "Акты на сумму больше договора",
                   "Актов на %s грн при цене договора %s грн." % (_fmt(c["acts_sum"]), _fmt(value)),
                   c, _money(c["acts_sum"] - value))
        if c["price_up"] and c["value0"]:
            share = c["price_up"] / c["value0"]
            sev = "high" if share > PRICE_UP_LIMIT else "medium"
            flags.append("price_up")
            signal("price_up", sev, "Цена договора увеличена допсоглашением",
                   "Рост на %s грн (+%.1f%%). Закон о закупках ограничивает рост цены за единицу 10%%." % (_fmt(c["price_up"]), share * 100),
                   c, c["price_up"], [a["ext_id"] for a in c["addendums"] if a["type"] == 1])
        if c["role"] == "disposer" and not c["tender"] and not c["prozorro"] and value >= threshold:
            flags.append("no_tender")
            signal("no_tender", "medium", "Крупный договор без процедуры в Prozorro",
                   "%s грн при пороге %s грн для %s. Основание: %s" % (_fmt(value), _fmt(threshold), "работ" if works else "товаров и услуг", c["reason"] or "не указано"),
                   c, value)
        first_pay = c["payments"][0]["date"] if c["payments"] else None
        if first_pay and c["date"] and first_pay < c["date"]:
            flags.append("paid_before")
            signal("paid_before", "medium", "Оплата раньше даты договора",
                   "Первый платёж %s, договор от %s." % (_dmy(first_pay), _dmy(c["date"])),
                   c, None, [c["payments"][0]["ext_id"]])
        late = _workdays_between(_day(c["date"]), _day(c["published"]))
        if c["role"] == "disposer" and late > PUBLISH_WORKDAYS:
            flags.append("late")  # summarised below: one line per organisation, not per contract
        if c["role"] == "disposer" and c["acts_sum"] and c["paid"] > c["acts_sum"] + max(1000, c["acts_sum"] * 0.05):
            flags.append("paid_over_acts")
            signal("paid_over_acts", "low", "Оплачено больше, чем подтверждено актами",
                   "Оплачено %s грн, актов на %s грн — проверьте предоплату или накладные." % (_fmt(c["paid"]), _fmt(c["acts_sum"])),
                   c, _money(c["paid"] - c["acts_sum"]))
        c["flags"] = flags
        c["late_days"] = late

