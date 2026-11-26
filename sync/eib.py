"""Procurements financed by the European Investment Bank, across all of Prozorro.

Prozorro names a donor in tender.funders (XM-DAC 33000 is the EIB) and its search
filters by it: funders[]=33000. Procedures that only mention the EIB in the text
are found by a text search and kept when the text really names the bank.

Writes data/eib.json: one compact row per procedure with its contracts, for the
app's page where contracts are found and taken on control.
"""
import re
import time

import compliance
import prozorro

EIB = "33000"
SCHEMA = 2  # 2: program markers, awards, complaints, compliance signals
TEXT_QUERIES = ("Європейський інвестиційний банк", "ЄІБ",
                # EIB finance contracts with Ukraine and the recovery programmes they fund
                "83.839", "84.165", "91.504", "Програма з відновлення України",
                "Надзвичайна кредитна програма для відновлення України", "НКПВУ", "ПВУ", "UPBEE",
                "Енергоефективність громадських будівель в Україні")
MENTION = re.compile(r"(ЄІБ|ЕІБ|\bEIB\b|європейськ\w*\s+інвестиційн\w*\s+банк|european\s+investment\s+bank)", re.I)
# The programmes, their EIB finance contracts (FI No. 83.839, 84.165, 91.504, 97.043) and the laws that
# ratify them (No. 1645-IX, 3905-IX, 4611-IX, typed with a Latin or a Cyrillic "IX").
PROGRAM = re.compile(r"(програм\w*\s+(?:з\s+)?відновлення\s+україни|надзвичайн\w*\s+кредитн\w*\s+програм\w*\s+для\s+відновлення"
                     r"|НКПВУ|UPBEE|енергоефективн\w*\s+громадськ\w*\s+будів\w*\s+в\s+україні"
                     r"|\bFI\s*№?\s*(83[.,]839|84[.,]165|91[.,]504|97[.,]043)|\b(83\.839|84\.165|91\.504|97\.043)\b"
                     r"|(?<!\d)(1645|3905|4611)\s*-\s*[IІ][XХ](?![A-Za-zА-Яа-я]))", re.I)
# The budget programme of the EIB recovery projects in a procurement plan (КПКВК ...7367, 3121690).
PLAN_PROGRAM = re.compile(r"(?<!\d)(?:\d{3})?7367(?!\d)|(?<!\d)3121690(?!\d)")
# "ПВУ" is also a ventilation unit: it counts only next to the programme's words.
PVU = re.compile(r"\bПВУ\b")
PVU_CONTEXT = re.compile(r"(відновлен|ЄІБ|ЕІБ|\bEIB\b)", re.I)


def classify(t, funded=False):
    """"funder" (EIB is the donor), "program" (an EIB finance contract or programme named),
    "text" (the bank named in the text) or "" for a compacted procedure."""
    if funded or any(f.get("code") == EIB for f in t.get("funders") or []):
        return "funder"
    plans = t.get("plan_info") or []
    plan_text = " ".join([p.get("text") or "" for p in plans] + [x.get("text") or "" for p in plans for x in p.get("sources") or []])
    text = " ".join([t.get("title") or "", t.get("rationale") or "", plan_text] + [c.get("title") or "" for c in t.get("contracts") or []]
                    + [d.get("title") or "" for d in t.get("docs") or []])
    if PROGRAM.search(text) or (PVU.search(text) and PVU_CONTEXT.search(text)):
        return "program"
    # A UNDP sub-project code in the contract number or the documents ("OD05A_09"), or the plan's
    # budget programme of the EIB recovery projects.
    if prozorro.subproject(t) or any(PLAN_PROGRAM.search(x.get("program") or "") for p in plans for x in p.get("sources") or []):
        return "program"
    if MENTION.search(text):
        return "text"
    return ""
REFRESH_AFTER_H = 20
BUDGET_S = 20 * 60


def _search(body):
    """All tenderIDs a search returns (up to the site's 1000)."""
    import urllib.parse
    out = []
    for page in range(1, prozorro.SEARCH_PAGES + 1):
        res = prozorro._get("%s/search/tenders?page=%d" % (prozorro.SITE, page), data=urllib.parse.urlencode(body).encode())
        data = res.get("data") or []
        out.extend(r["tenderID"] for r in data if r.get("tenderID"))
        if len(data) < 20:
            break
    return out


def _row(t, kind):
    """What the page needs: no documents, only their number; compliance signals per contract."""
    contracts = []
    for c in t.get("contracts") or []:
        c = dict(c, signals=[{"type": x["type"], "severity": x["severity"], "params": x["params"]}
                             for x in compliance.evaluate(t, c, eib=True)["signals"]])
        contracts.append({k: v for k, v in dict(c, docs=len(c.get("docs") or []), changes=len(c.get("changes") or [])).items()
                          if k not in ("termination",) and v not in (None, "", [], 0)})
    row = {k: v for k, v in t.items() if k not in ("docs", "milestones", "contracts", "rationale", "lots")}
    row.update(eib=kind, contracts=contracts, docs=len(t.get("docs") or []),
               terms=[m for m in t.get("milestones") or [] if m.get("type") == "financing"])
    return row


def sync(old, log=print):
    """Bring data/eib.json up to date; `old` is its previous content."""
    started = time.time()
    fresh_schema = (old or {}).get("schema") == SCHEMA
    rows = {r["tid"]: r for r in (old or {}).get("items") or []}
    skip = set((old or {}).get("skip") or []) if fresh_schema else set()
    errors = []
    try:
        funded = _search({"funders[]": EIB})
    except prozorro.ProzorroError as e:
        log("! ЄІБ: пошук за донором: %s" % e)
        return old
    mentioned = []
    for q in TEXT_QUERIES:
        try:
            mentioned.extend(_search({"text": q}))
        except prozorro.ProzorroError as e:
            errors.append(str(e))
    funded_set = set(funded)
    wanted = list(dict.fromkeys(funded + [m for m in mentioned if m not in skip]))
    cutoff = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - REFRESH_AFTER_H * 3600))
    # Known procedures first: their internal ids are stored and the public API has no rate
    # limit; new candidates need a lookup on prozorro.gov.ua (60 a minute, fewer from CI).
    todo = sorted(
        (tid for tid in wanted if tid in rows and (not fresh_schema or rows[tid].get("_v") != SCHEMA
                                                   or not prozorro.is_final(rows[tid]) and rows[tid].get("_at", "") < cutoff)),
        key=lambda tid: rows[tid].get("_at", "")) + [tid for tid in wanted if tid not in rows]
    done = tried = 0
    for tid in todo:
        if time.time() - started > BUDGET_S:
            break
        tried += 1
        try:
            pid = (rows.get(tid) or {}).get("id") or prozorro.internal_id(tid)
            t = prozorro.load_tender(pid)
        except prozorro.ProzorroError as e:
            if e.status in (403, 404, 410):
                skip.add(tid)
            else:
                errors.append("%s: %s" % (tid, e))
            continue
        kind = classify(t, tid in funded_set)
        if not kind:
            skip.add(tid)  # the search matched something else
            rows.pop(tid, None)
            continue
        row = _row(t, kind)
        row["_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        row["_v"] = SCHEMA
        rows[tid] = row
        done += 1
    log("ЄІБ: процедур %d (донор %d), оновлено %d, лишилось %d%s" % (
        len(rows), len(funded_set), done, len(todo) - tried, "; помилки: " + "; ".join(errors[:3]) if errors else ""))
    items = sorted(rows.values(), key=lambda r: (r.get("date") or "", r["tid"]), reverse=True)
    return {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "schema": SCHEMA, "items": items, "skip": sorted(skip)}
