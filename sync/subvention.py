"""Subvention to local budgets for EIB recovery projects, as the Cabinet of Ministers spreads it.

Each programme's yearly distribution is a CMU order (розпорядження) with an annex listing, per local
budget, every project and its amount (thousand UAH). The order is amended during the year, and
each edition is kept by the parliament's legal database, so the history of a project's subvention
(added, raised, cut to a token 1 thousand) can be read from it.

Two shapes of source, both read by year:
  - an order of its own each year ("Про розподіл у 2026 році субвенції …", URP III: 52-2026-р);
  - an annex "Розподіл у <year> році …" inside the programme's standing resolution, replaced
    every year (URP: 1324-2021-п; UERP: 1068-2015-п).
New orders are picked up from the parliament's list of new documents by their title.

Source: the open data of zakon.rada.gov.ua (data.rada.gov.ua, served to the "OpenData" user agent):
  /laws/card/<nreg>.json            editions (eds[].datred)
  /laws/show/<nreg>/ed<date>        an edition as HTML: its annexes are links "!<file>.docx"
  /laws/show/<nreg>/ed<date>.txt    an edition as text (some annexes are inline)
  /laws/file/text/1/<file>.docx     an annex file (the directory part is not checked)
  /laws/main/n.json                 the latest new documents
Writes data/subvention.json.
"""
import html
import io
import json
import re
import time
import urllib.parse
import urllib.error
import urllib.request
import zipfile

import spending

BASE = "https://data.rada.gov.ua/laws"
UA = "OpenData"
# Where each programme's distribution lives. "order": a separate order for one year; "annex": a
# yearly annex of a standing resolution. Orders found in the new documents are added by themselves.
SOURCES = [
    {"nreg": "52-2026-р", "programme": "URP III", "kind": "order", "year": 2026},
    {"nreg": "1324-2021-п", "programme": "URP", "kind": "annex"},
    {"nreg": "1068-2015-п", "programme": "UERP", "kind": "annex"},
]
ORDER_TITLE = re.compile(r"^Про розподіл у (\d{4}) році субвенції з державного бюджету місцевим бюджетам на реалізацію проектів (?:у|в) рамках (.+)$")
CODE = re.compile(r"^\d{10}$")
AMOUNT = re.compile(r"^\d[\d  ]*(?:,\d+)?$")


class Unreachable(Exception):
    """The site does not answer at all (it is not reachable from abroad, e.g. from GitHub)."""


_down = [False]


def _get(path):
    if _down[0]:
        raise Unreachable("data.rada.gov.ua недоступний")
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA})
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=25, context=spending._ctx) as res:
                return res.read()
        except urllib.error.URLError as e:
            # No connection at all: give up at once and for the whole run.
            if isinstance(getattr(e, "reason", None), (TimeoutError, OSError)) and not isinstance(e, urllib.error.HTTPError):
                _down[0] = True
                raise Unreachable("data.rada.gov.ua недоступний: %s" % e.reason)
            last = e
        except Exception as e:  # noqa: BLE001 - the site cuts answers short now and then
            last = e
        time.sleep(2 + 3 * attempt)
    raise last


def _num(s):
    return float(s.replace(" ", "").replace(" ", "").replace(",", "."))


def _clean(s):
    return re.sub(r"\s+", " ", html.unescape(s or "").replace(" ", " ")).strip()


def _rows_txt(text, year):
    """The lines of the year's distribution in a text edition (from its "РОЗПОДІЛ" heading)."""
    lines = [_clean(x) for x in text.splitlines()]
    lines = [x for x in lines if x]
    for i, x in enumerate(lines):
        if x == "РОЗПОДІЛ" and i + 1 < len(lines) and ("у %d році" % year) in lines[i + 1]:
            end = next((j for j in range(i + 2, len(lines)) if lines[j] in ("РОЗПОДІЛ", "ЗВЕДЕНЕ РОЗПОРЯДЖЕННЯ", "ІНФОРМАЦІЯ")), len(lines))
            return lines[i:end]
    return []


def programme_of(title):
    t = title or ""
    if "Надзвичайної кредитної" in t:
        return "UERP"
    if re.search(r"Програми відновлення України III|Програми з відновлення України III", t):
        return "URP III"
    if "Програми з відновлення України" in t:
        return "URP"
    return re.sub(r"^.*рамках\s+", "", t)[:80]


def discover(known, log=print):
    """Orders "Про розподіл у <year> році субвенції … в рамках <programme>" among new documents."""
    try:
        items = json.loads(_get("/main/n.json")).get("list") or []
    except Exception as e:  # noqa: BLE001
        log("  ! нові документи Ради: %s" % e)
        return []
    out = []
    for x in items:
        m = ORDER_TITLE.match(_clean(x.get("nazva")))
        if m and x.get("nreg") and x["nreg"] not in known and re.search(r"відновлення|відновлення", m.group(2), re.I):
            out.append({"nreg": x["nreg"], "programme": programme_of(m.group(2)), "kind": "order", "year": int(m.group(1)), "auto": True})
            log("  субвенція: нове розпорядження %s — %s" % (x["nreg"], _clean(x.get("nazva"))[:120]))
    return out


# The oblast by the first two digits of a budget's code (the State Treasury's codes of budgets):
# surer than the headings of the annex, whose layout differs from one resolution to another.
REGION_BY_CODE = {"02": "Вінницька область", "03": "Волинська область", "04": "Дніпропетровська область", "05": "Донецька область",
                  "06": "Житомирська область", "07": "Закарпатська область", "08": "Запорізька область", "09": "Івано-Франківська область",
                  "10": "Київська область", "11": "Кіровоградська область", "12": "Луганська область", "13": "Львівська область",
                  "14": "Миколаївська область", "15": "Одеська область", "16": "Полтавська область", "17": "Рівненська область",
                  "18": "Сумська область", "19": "Тернопільська область", "20": "Харківська область", "21": "Херсонська область",
                  "22": "Хмельницька область", "23": "Черкаська область", "24": "Чернівецька область", "25": "Чернігівська область",
                  "26": "м. Київ"}


def region_of(p):
    return REGION_BY_CODE.get(str(p.get("budget_code") or "")[:2]) or p.get("region") or ""


def _parse_lines(lines):
    out, region, code, budget = [], "", "", ""
    i = 0
    while i < len(lines):
        x = lines[i]
        if re.search(r"область, усього$|^м\. Київ, усього$", x):
            region = x.replace(", усього", "")
        elif CODE.match(x) and i + 1 < len(lines):
            code, budget = x, lines[i + 1].replace(", усього", "")
            # Spread by budget only (no projects under it): code, budget, amount, then the next one.
            if i + 2 < len(lines) and AMOUNT.match(lines[i + 2]) and (i + 3 >= len(lines) or lines[i + 3] != "у тому числі:"):
                out.append({"region": region, "budget_code": code, "budget": budget, "name": "", "amount": _num(lines[i + 2])})
                i += 2
            i += 1
        elif x.endswith(" область") or x == "м. Київ":
            region = x
        elif AMOUNT.match(x) and i + 1 < len(lines):
            nxt = lines[i + 1]
            # an amount followed by a project name (not by another amount, a code or a heading)
            if not AMOUNT.match(nxt) and not CODE.match(nxt) and nxt != "у тому числі:" and not nxt.endswith("усього"):
                out.append({"region": region, "budget_code": code, "budget": budget, "name": nxt, "amount": _num(x)})
                i += 1
        i += 1
    return out


def _parse_docx(data):
    """The annex table of a .docx: rows of [code, budget, amount, project]."""
    x = zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml").decode("utf-8")
    out, region, code, budget = [], "", "", ""
    for tr in re.findall(r"<w:tr[ >].*?</w:tr>", x, re.S):
        cells = [_clean(re.sub(r"<[^>]+>", "", " ".join(re.findall(r"<w:t[^>]*>.*?</w:t>", tc, re.S))))
                 for tc in re.findall(r"<w:tc>.*?</w:tc>", tr, re.S)]
        if not cells:
            continue
        if cells[0].endswith("усього") and "область" in cells[0]:
            region = cells[0].replace(", усього", "")
            continue
        if not cells[0] and len(cells) == 3 and (cells[1].endswith("область") or cells[1] == "м. Київ"):
            region = cells[1]
            continue
        if len(cells) == 3 and CODE.match(cells[0]) and AMOUNT.match(cells[2] or ""):
            out.append({"region": region, "budget_code": cells[0], "budget": cells[1].replace(", усього", ""), "name": "", "amount": _num(cells[2])})
            continue
        if CODE.match(cells[0]) and len(cells) > 1:
            code, budget = cells[0], cells[1].replace(", усього", "")
        if len(cells) >= 4 and cells[3] and AMOUNT.match(cells[2] or ""):
            out.append({"region": region, "budget_code": code, "budget": budget, "name": cells[3], "amount": _num(cells[2])})
    return out


ANNEX_LINK = re.compile(r'<a href="!(f\d+n\d+\.docx)">\s*РОЗПОДІЛ\s*</a>(.{0,600})', re.S)


def _edition(nreg, ed, year):
    """The year's distribution in one edition: from its .docx annex, or inline in the text."""
    page = _get("/show/%s/ed%s" % (nreg, ed)).decode("utf-8", "ignore")
    for m in ANNEX_LINK.finditer(page):
        if ("у %d році" % year) in _clean(re.sub(r"<[^>]+>", " ", m.group(2))):
            return _parse_docx(_get("/file/text/1/" + m.group(1)))
    return _parse_lines(_rows_txt(_get("/show/%s/ed%s.txt" % (nreg, ed)).decode("utf-8", "ignore"), year))


def decree(d, year, log=print):
    nreg = urllib.parse.quote(d["nreg"])
    card = json.loads(_get("/card/%s.json" % nreg))
    dates = sorted({str(e["datred"]) for e in card.get("eds") or []} | {str(card.get("datred") or "")} - {""})
    # Editions that can hold this year's distribution: from the autumn before.
    dates = [x for x in dates if x >= "%d0901" % (year - 1)]
    editions = {}
    for ed in dates:
        projects = _edition(nreg, ed, year)
        if projects:
            editions[ed] = projects
        log("  субвенція %s (%s) ред. %s: проєктів %d" % (d["nreg"], d["programme"], ed, len(projects)))
    eds = sorted(editions)
    # One line per project with its amount in each edition.
    merged = {}
    for ed in eds:
        for p in editions[ed]:
            key = (p["budget_code"], re.sub(r"[^0-9а-яіїєґa-z]+", "", p["name"].lower())[:80])  # a "(коригування)" added later keeps the project
            m = merged.setdefault(key, dict({k: p[k] for k in ("budget_code", "budget", "name")}, region=region_of(p)))
            m["name"] = p["name"]  # the latest wording
            m.setdefault("amounts", {})[ed] = round(m.get("amounts", {}).get(ed, 0) + p["amount"], 3)
    return {"nreg": d["nreg"], "programme": d["programme"], "kind": d["kind"], "year": year, "title": card.get("nazva") or "",
            "editions": eds, "url": "https://zakon.rada.gov.ua/laws/show/%s" % d["nreg"], "auto": bool(d.get("auto"))}, list(merged.values())


def sync(path, log=print):
    year = time.gmtime().tm_year
    try:
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        old = {}
    # Orders found before stay on the list; new ones come from the latest documents.
    sources = SOURCES + [d for d in old.get("found") or [] if d["nreg"] not in {s["nreg"] for s in SOURCES}]
    found = [d for d in sources if d.get("auto")] + discover({s["nreg"] for s in sources}, log)
    sources += [d for d in found if d["nreg"] not in {s["nreg"] for s in sources}]
    decrees, projects, fresh = [], [], 0
    for d in sources:
        y = d.get("year") or year
        if d["kind"] == "order" and y != year:
            continue
        try:
            info, items = decree(d, y, log)
            fresh += 1
        except Exception as e:  # noqa: BLE001 - keep what the last run had for it
            log("  ! субвенція %s: %s" % (d["nreg"], e))
            info = next((x for x in old.get("decrees") or [] if x.get("nreg") == d["nreg"]), None)
            items = [p for p in old.get("projects") or [] if p.get("nreg") == d["nreg"]]
            if not info:
                continue
        if not items:
            continue
        decrees.append(info)
        projects += [dict(p, nreg=d["nreg"], programme=d["programme"], region=region_of(p)) for p in items]
    # Nothing read anew (the site did not answer): the file stays as the last good run left it, so
    # a run that cannot reach the site never overwrites one that could (the daily run on the Mac).
    if not fresh and old:
        log("Субвенція: джерела недоступні, лишаю дані від %s" % old.get("generated_at"))
        return
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "year": year, "decrees": decrees,
                   "found": [d for d in found if d.get("auto")], "projects": projects}, f, ensure_ascii=False, indent=2, sort_keys=True)
    log("Субвенція: джерел %d, проєктів %d" % (len(decrees), len(projects)))
