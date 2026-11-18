"""Signs of collusion between bidders and of a link between the buyer and a bidder, read from the
procedure's bids as Prozorro publishes them after the award (tenderers' contacts, prices, times,
document lists). Each sign is a reason to look, not proof.

  shared_email / shared_phone / shared_person   two bidders give the same contact            high
  shared_address                                 the same street address                      medium
  buyer_link                                     a bidder's contact is the buyer's own        high
  price_cluster                                  3+ prices within 1% of each other            medium
  near_expected                                  3+ prices, all within 1.5% under the expected low
  same_time                                      two bids filed within 90 seconds             medium
  docs_alike                                     two bids with the same set of file names     medium
  loser_subcontractor                            a losing bidder named as the winner's sub    high

The contact person's name is compared but never written out; e-mails, phones and addresses
are the companies' own, as Prozorro shows them.
"""
import re
from datetime import datetime
from itertools import combinations

GENERIC_DOCS = re.compile(r"^(витяг|довідк|статут|паспорт|ідентифікац|податк|реєстр|наказ|протокол|лист|декларац|кошторис|договір)", re.I)


def _digits(s):
    d = re.sub(r"\D", "", str(s or ""))
    return d[-9:] if len(d) >= 9 else ""


def _email(s):
    s = str(s or "").strip().lower()
    return s if re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", s) else ""


def _person(s):
    w = re.findall(r"[a-zа-яіїєґ']+", str(s or "").lower())
    w = [x for x in w if len(x) > 1 and x not in ("тов", "товариство", "обмеженою", "відповідальністю", "з", "пп", "фоп")]
    return " ".join(sorted(w)) if len(w) >= 2 else ""


def _address(a):
    a = a or {}
    street = re.sub(r"[^0-9a-zа-яіїєґ]+", " ", str(a.get("streetAddress") or "").lower()).strip()
    if len(street) < 6 or not re.search(r"\d", street):
        return ""
    return street + "|" + str(a.get("locality") or "").lower().strip()


def _docname(s):
    s = re.sub(r"\.(pdf|docx?|xlsx?|jpe?g|png|zip|rar|p7s|asice?)$", "", str(s or "").lower().strip())
    return re.sub(r"[^0-9a-zа-яіїєґ]+", " ", s).strip()


def _time(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def _contacts(party):
    cps = [party.get("contactPoint") or {}] + list(party.get("additionalContactPoints") or [])
    return {
        "email": {e for e in (_email(c.get("email")) for c in cps) if e},
        "phone": {p for c in cps for p in (_digits(c.get("telephone")), _digits(c.get("faxNumber"))) if p},
        "person": {p for p in (_person(c.get("name")) for c in cps) if p},
        "address": {x for x in [_address(party.get("address"))] if x},
    }


def _bidders(t):
    """One entry per bid and lot: code, name, amount, time, contacts, document names."""
    out = []
    for b in t.get("bids") or []:
        if b.get("status") in ("deleted", "invalid.pre-qualification", "draft"):
            continue
        tn = (b.get("tenderers") or [{}])[0]
        base = {"bid": b.get("id"), "code": str((tn.get("identifier") or {}).get("id") or ""), "name": tn.get("name") or "",
                "time": _time(b.get("date")), "contacts": _contacts(tn),
                "docs": {_docname(d.get("title")) for d in (b.get("documents") or []) + (b.get("financialDocuments") or []) + (b.get("eligibilityDocuments") or []) + (b.get("qualificationDocuments") or [])
                         if _docname(d.get("title"))}}
        lvs = b.get("lotValues") or []
        if lvs:
            for lv in lvs:
                out.append(dict(base, lot=lv.get("relatedLot"), amount=(lv.get("value") or {}).get("amount")))
        else:
            out.append(dict(base, lot=None, amount=(b.get("value") or {}).get("amount")))
    return out


def check(t):
    """Findings of the procedure: [{kind, level, lot, a, b, value?}] (a, b: bidders' codes)."""
    bidders = _bidders(t)
    if not bidders:
        return []
    found, seen = [], set()

    def add(kind, level, lot, a=None, b=None, value=None):
        key = (kind, lot, tuple(sorted(filter(None, (a, b)))), value)
        if key in seen:
            return
        seen.add(key)
        found.append({k: v for k, v in {"kind": kind, "level": level, "lot": lot, "a": a, "b": b, "value": value}.items() if v is not None})

    lots = {}
    for x in bidders:
        lots.setdefault(x["lot"], []).append(x)
    expected = {l.get("id"): (l.get("value") or {}).get("amount") for l in t.get("lots") or []}
    expected[None] = (t.get("value") or {}).get("amount")

    # Contacts shared by two different bidders, whatever the lot.
    firms = {}
    for x in bidders:
        firms.setdefault(x["code"] or x["name"], x)
    for x, y in combinations(list(firms.values()), 2):
        cx, cy = x["contacts"], y["contacts"]
        for kind, level in (("email", "high"), ("phone", "high"), ("person", "high"), ("address", "medium")):
            common = cx[kind] & cy[kind]
            if common:
                add("shared_" + kind, level, None, x["code"], y["code"], None if kind == "person" else sorted(common)[0].split("|")[0])
        both = {d for d in x["docs"] & y["docs"] if not GENERIC_DOCS.match(d)}
        union = x["docs"] | y["docs"]
        if len(both) >= 5 and union and len(x["docs"] & y["docs"]) / len(union) >= 0.5:
            add("docs_alike", "medium", None, x["code"], y["code"], str(len(x["docs"] & y["docs"])))
        if x["time"] and y["time"] and abs((x["time"] - y["time"]).total_seconds()) <= 90:
            add("same_time", "medium", None, x["code"], y["code"], "%d" % abs((x["time"] - y["time"]).total_seconds()))

    # The buyer's own contacts in a bid.
    buyer = _contacts(t.get("procuringEntity") or {})
    for x in firms.values():
        for kind in ("email", "phone", "person"):
            if buyer[kind] & x["contacts"][kind]:
                add("buyer_link", "high", None, x["code"], None, kind)

    # Prices: close to each other, or all just under the expected value.
    for lot, xs in lots.items():
        amounts = [x["amount"] for x in xs if x.get("amount")]
        if len(amounts) >= 3 and (max(amounts) - min(amounts)) / min(amounts) <= 0.01:
            add("price_cluster", "medium", lot, value="%.2f" % ((max(amounts) - min(amounts)) / min(amounts) * 100))
        exp = expected.get(lot)
        # Common in works on its own; a sign only beside others, so "low".
        if exp and len(amounts) >= 3 and all(0.985 * exp <= a <= exp for a in amounts):
            add("near_expected", "low", lot, value="%.2f" % ((exp - min(amounts)) / exp * 100))

    # A losing bidder named among the winner's subcontractors.
    won = {a.get("bid_id") for a in t.get("awards") or [] if a.get("status") == "active"}
    for b in t.get("bids") or []:
        if b.get("id") not in won:
            continue
        text = " ".join([str(b.get("subcontractingDetails") or "")] + [str(lv.get("subcontractingDetails") or "") for lv in b.get("lotValues") or []]).lower()
        if not text.strip():
            continue
        wcode = str(((b.get("tenderers") or [{}])[0].get("identifier") or {}).get("id") or "")
        for x in firms.values():
            if x["code"] == wcode:
                continue
            core = re.sub(r"(товариство з обмеженою відповідальністю|тов|пп|приватне підприємство|[\"'«»“”])", " ", x["name"].lower()).strip()
            if (x["code"] and x["code"] in text) or (len(core) >= 5 and core in text):
                add("loser_subcontractor", "high", None, wcode, x["code"])
    names = {x["code"]: x["name"] for x in bidders if x["code"]}
    for f in found:
        for k in ("a", "b"):
            if f.get(k) in names:
                f[k + "_name"] = names[f[k]][:160]
    return found
