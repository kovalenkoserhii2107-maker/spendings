"""Subvention to local budgets for EIB recovery projects, as the Cabinet of Ministers spreads it.

Each programme's yearly distribution is a CMU order (розпорядження) with an annex listing, per local
budget, every project and its amount (thousand UAH). The order is amended during the year, and
each edition is kept by the parliament's legal database, so the history of a project's subvention
(added, raised, cut to a token 1 thousand) can be read from it.

Source: the open data of zakon.rada.gov.ua (data.rada.gov.ua, served to the "OpenData" user agent):
  /laws/card/<nreg>.json          editions (datred) and the annex file of the current one
  /laws/show/<nreg>/ed<date>.txt  an edition as text (older editions carry the annex inline)
  /laws/file/text/<dir>/<name>    the current annex as .docx when the text has none
Writes data/subvention.json.
"""
import html
import io
import json
import re
import time
import urllib.parse
import urllib.request
import zipfile

import spending

BASE = "https://data.rada.gov.ua/laws"
UA = "OpenData"
# One order per programme and year; add new ones here.
DECREES = [
    {"nreg": "52-2026-р", "programme": "URP III", "year": 2026},
]
CODE = re.compile(r"^\d{10}$")
AMOUNT = re.compile(r"^\d[\d  ]*(?:,\d+)?$")


def _get(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60, context=spending._ctx) as res:
                return res.read()
        except Exception as e:  # noqa: BLE001 - the site drops connections now and then
            last = e
            time.sleep(3 * (attempt + 1))
    raise last


def _num(s):
    return float(s.replace(" ", "").replace(" ", "").replace(",", "."))


def _clean(s):
    return re.sub(r"\s+", " ", html.unescape(s or "").replace(" ", " ")).strip()


def _rows_txt(text):
    """The annex of a text edition as [cells], one line per cell, regrouped into rows."""
    lines = [_clean(x) for x in text.splitlines()]
    lines = [x for x in lines if x]
    try:
        start = next(i for i, x in enumerate(lines) if x == "РОЗПОДІЛ")
    except StopIteration:
        return []
    return lines[start:]


def _parse_lines(lines):
    out, region, code, budget = [], "", "", ""
    i = 0
    while i < len(lines):
        x = lines[i]
        if re.search(r"область, усього$|^м\. Київ, усього$", x):
            region = x.replace(", усього", "")
        elif CODE.match(x) and i + 1 < len(lines):
            code, budget = x, lines[i + 1].replace(", усього", "")
            i += 1
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
        if CODE.match(cells[0]) and len(cells) > 1:
            code, budget = cells[0], cells[1].replace(", усього", "")
        if len(cells) >= 4 and cells[3] and AMOUNT.match(cells[2] or ""):
            out.append({"region": region, "budget_code": code, "budget": budget, "name": cells[3], "amount": _num(cells[2])})
    return out


def decree(d, log=print):
    nreg = urllib.parse.quote(d["nreg"])
    card = json.loads(_get("/card/%s.json" % nreg))
    dates = sorted({str(e["datred"]) for e in card.get("eds") or []} | {str(card.get("datred") or "")} - {""})
    editions = {}
    for ed in dates:
        projects = _parse_lines(_rows_txt(_get("/show/%s/ed%s.txt" % (nreg, ed)).decode("utf-8", "ignore")))
        if not projects and ed == str(card.get("datred")):
            for s in card.get("sig") or []:
                if s.get("name", "").endswith(".docx"):
                    projects = _parse_docx(_get("/file" + s["filename"]))
                    break
        editions[ed] = projects
        log("  субвенція %s ред. %s: проєктів %d" % (d["nreg"], ed, len(projects)))
    # One line per project with its amount in each edition.
    merged = {}
    for ed in dates:
        for p in editions[ed]:
            key = (p["budget_code"], re.sub(r"[^0-9а-яіїєґa-z]+", "", p["name"].lower())[:80])  # a "(коригування)" added later keeps the project
            m = merged.setdefault(key, {k: p[k] for k in ("region", "budget_code", "budget", "name")})
            m.setdefault("amounts", {})[ed] = round(m.get("amounts", {}).get(ed, 0) + p["amount"], 3)
    return {"nreg": d["nreg"], "programme": d["programme"], "year": d["year"], "title": card.get("nazva") or "",
            "editions": dates, "url": "https://zakon.rada.gov.ua/laws/show/%s" % d["nreg"]}, list(merged.values())


def sync(path, log=print):
    decrees, projects = [], []
    for d in DECREES:
        try:
            info, items = decree(d, log)
        except Exception as e:  # noqa: BLE001 - keep the last file
            log("  ! субвенція %s: %s" % (d["nreg"], e))
            return
        decrees.append(info)
        projects += [dict(p, nreg=d["nreg"]) for p in items]
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "decrees": decrees, "projects": projects},
                  f, ensure_ascii=False, separators=(",", ":"))
    log("Субвенція: розпоряджень %d, проєктів %d" % (len(decrees), len(projects)))
