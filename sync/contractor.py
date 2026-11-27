"""The contractor's profile, for criterion 5 of the UNDP matrix ("Contractor on other sub-projects")
and the expert's look at who is building: how much and for whom it works in Prozorro, how much it
has on its hands right now, and its EIB contracts and contracts on control.

Prozorro's contract search (`supplier[]`) gives, per contract, its id (with the procedure's date),
price, buyer and status; read newest first, up to MAX_PAGES pages. Profiles are kept in
data/contractors/<code>.json and read again after REFRESH_DAYS. Only legal entities (8-digit
EDRPOU): an entrepreneur's code is a personal tax number.
"""
import glob
import json
import os
import re
import time
import urllib.parse
from collections import Counter, defaultdict

import prozorro

REFRESH_DAYS = 7
VERSION = 2  # 2: the largest contracts (the programme's "similar contract of 30%")
MAX_PAGES = 25          # 500 latest contracts
ID_DATE = re.compile(r"^UA-(\d{4})-(\d{2})-(\d{2})-\d{6}-[a-z]")


def _rows(code, log):
    out, total, page = [], 0, 1
    while page <= MAX_PAGES:
        body = urllib.parse.urlencode({"supplier[]": code, "sort_by": "dateSigned", "order": "desc"}).encode()
        res = prozorro._get("%s/search/contracts?page=%d" % (prozorro.SITE, page), data=body)
        data = res.get("data") or []
        total = int(res.get("total") or 0)
        out += data
        if len(data) < 20 or len(out) >= total:
            break
        page += 1
    return out, total


def _name(x):
    return ((x.get("identifier") or {}).get("legalName") or x.get("name") or "").strip()


def build(code, eib_rows, tracked_rows, today, log=print):
    rows, total = _rows(code, log)
    year = int(today[:4])
    by_year, buyers = defaultdict(lambda: [0, 0.0]), defaultdict(lambda: [0, 0.0])
    active_n, active_v, name, first = 0, 0.0, "", None
    big = []
    for r in rows:
        if r.get("status") == "cancelled":
            continue
        v = ((r.get("value") or {}).get("amount") or 0) or 0
        m = ID_DATE.match(r.get("contractID") or "")
        y = int(m.group(1)) if m else None
        if y:
            by_year[y][0] += 1
            by_year[y][1] += v
            first = min(first or y, y)
        if v:
            big.append({"cid": r.get("contractID"), "value": round(v, 2), "status": r.get("status"),
                        "day": "%s-%s-%s" % m.groups() if m else None, "buyer": _name(r.get("buyer") or {})[:120]})
        b = _name(r.get("buyer") or {})
        buyers[b][0] += 1
        buyers[b][1] += v
        # Buyers often leave old contracts "active": only those of the last two years count.
        if r.get("status") == "active" and y and y >= year - 1:
            active_n += 1
            active_v += v
        # The name of the supplier with this code (a joint bid lists several).
        if not name:
            sup = next((x for x in r.get("suppliers") or [] if str((x.get("identifier") or {}).get("id") or "") == code), None)
            name = _name(sup or ((r.get("suppliers") or [{}])[0]))
    # The yearly volume of the last three full years, to weigh what is on its hands now.
    past = [by_year[y][1] for y in (year - 1, year - 2, year - 3) if y in by_year]
    avg = sum(past) / len(past) if past else 0
    load = round(active_v / avg, 2) if avg else None
    top = sorted(buyers.items(), key=lambda kv: -kv[1][1])[:5]
    eib = [x for x in eib_rows if code in x["codes"]]
    tracked = [x for x in tracked_rows if code in x["codes"]]
    return {
        "code": code, "name": name, "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "v": VERSION,
        "top": sorted(big, key=lambda x: -x["value"])[:15],
        "total": total, "read": len(rows), "truncated": total > len(rows),
        "value": round(sum(v for _, v in by_year.values()), 2), "first_year": first,
        "active": {"n": active_n, "value": round(active_v, 2), "since": year - 1},
        "terminated": sum(1 for r in rows if r.get("status") == "terminated"),
        "years": [{"y": y, "n": by_year[y][0], "value": round(by_year[y][1], 2)} for y in sorted(by_year, reverse=True)[:6]],
        "avg_year": round(avg, 2), "load": load,
        "buyers": [{"name": b, "n": n, "value": round(v, 2)} for b, (n, v) in top],
        "buyers_n": len(buyers),
        "eib": [{k: x[k] for k in ("tid", "number", "bad", "buyer", "value") if x.get(k)} for x in eib][:20],
        "tracked": [{k: x[k] for k in ("key", "number", "bad") if x.get(k)} for x in tracked][:20],
    }


def flags(p):
    """What the expert should look at: (kind, level)."""
    out = []
    if not p:
        return out
    if p.get("load") is not None and p["load"] >= 1.5 and p["active"]["value"] > 5e6:
        out.append(("overloaded", "medium" if p["load"] < 3 else "high"))
    if p.get("first_year") and p["first_year"] >= int(p["built_at"][:4]) - 1 and p["value"] < 5e6:
        out.append(("newcomer", "medium"))
    return out  # trouble on its other contracts is weighed by the card, without the contract at hand


def _sources(data_dir):
    eib_rows, tracked_rows = [], []
    try:
        with open(os.path.join(data_dir, "eib.json"), encoding="utf-8") as f:
            for t in json.load(f).get("items") or []:
                for c in t.get("contracts") or []:
                    eib_rows.append({"tid": t.get("tid"), "number": c.get("number"), "codes": [s.get("code") for s in c.get("suppliers") or []],
                                     "buyer": t.get("buyer_name") or (t.get("buyer") or {}).get("name"), "value": (c.get("value") or {}).get("amount"),
                                     "bad": sorted({x["type"] for x in c.get("signals") or [] if x.get("severity") == "high"})})
    except (OSError, ValueError):
        pass
    for path in glob.glob(os.path.join(data_dir, "tracked", "*.json")):
        if path.endswith("index.json"):
            continue
        try:
            with open(path, encoding="utf-8") as f:
                s = json.load(f)
        except (OSError, ValueError):
            continue
        c = s.get("contract") or {}
        bad = {x["type"] for x in s.get("signals") or [] if x.get("severity") == "high"}
        if ((s.get("undp") or {}).get("progress") or {}).get("overdue_days"):
            bad.add("overdue")
        tracked_rows.append({"key": s.get("key"), "number": c.get("number"), "codes": [x.get("code") for x in c.get("suppliers") or []], "bad": sorted(bad)})
    return eib_rows, tracked_rows


def sync(codes, data_dir, today, budget_s=300, log=print):
    """Profiles of these contractors, the stalest first, within the time budget."""
    out_dir = os.path.join(data_dir, "contractors")
    os.makedirs(out_dir, exist_ok=True)
    codes = sorted({c for c in codes if c and re.fullmatch(r"\d{8}", c)})
    eib_rows, tracked_rows = _sources(data_dir)
    ages = {}
    for c in codes:
        try:
            with open(os.path.join(out_dir, c + ".json"), encoding="utf-8") as f:
                p = json.load(f)
                ages[c] = (p.get("built_at") or "") if p.get("v") == VERSION else ""
        except (OSError, ValueError):
            ages[c] = ""
    stale = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - REFRESH_DAYS * 86400))
    started, done = time.time(), 0
    for c in sorted(codes, key=lambda c: ages[c]):
        if ages[c] > stale:
            continue
        if time.time() - started > budget_s:
            log("  профілі підрядників: решта — наступного разу")
            break
        try:
            p = build(c, eib_rows, tracked_rows, today, log)
        except Exception as e:  # noqa: BLE001 - the old profile stays
            log("  ! профіль %s: %s" % (c, e))
            continue
        p["flags"] = [{"kind": k, "level": lv} for k, lv in flags(p)]
        with open(os.path.join(out_dir, c + ".json"), "w", encoding="utf-8") as f:
            json.dump(p, f, ensure_ascii=False, separators=(",", ":"))
        done += 1
    log("Профілі підрядників: оновлено %d із %d" % (done, len(codes)))


def load(code, data_dir):
    try:
        with open(os.path.join(data_dir, "contractors", code + ".json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError, TypeError):
        return None
