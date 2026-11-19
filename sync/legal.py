"""The legal standing of contractors, bidders and buyers (criterion 6 of the UNDP matrix), from open
registers:

  ЄДР (Ministry of Justice, data.gov.ua, uo.zip ~330 MB, refreshed weekly): the state of the legal
      entity (registered / being terminated / terminated / bankruptcy), registration date, capital,
      founders, ultimate beneficiaries and their citizenship, managers. Read as a stream; only the
      codes asked for are kept.
  Sanctions (OpenSanctions, daily): NSDC register, "War and Sanctions" (GUR), the SFMS blacklist,
      EU, OFAC, World Bank debarment, EBRD ineligible — matched by the EDRPOU code.
  AMCU (data.gov.ua, weekly): decisions finding bid rigging ("спотворення результатів торгів");
      for three years after such a decision a bidder must be rejected (Art. 17 of the Public
      Procurement Law).

People are never written out: founders, beneficiaries and managers are kept as short hashes of
their names, enough to see the same person in two companies, plus counts and citizenships.
Tax debtors are not published by the Tax Service since 2022, so there is no such check.
data.gov.ua answers automated clients with 403 at times (its Cloudflare protection): the ЄДР and
AMCU parts then wait a day and try again; nothing is done to get round it.

Writes data/legal.json: {"edr_at", "sanctions_at", "amcu_at", "items": {code: {...}}}.
"""
import csv
import hashlib
import html
import io
import json
import os
import re
import struct
import time
import urllib.request
import zipfile
import zlib
from datetime import date, timedelta

import spending

EDR_URL = "https://data.gov.ua/dataset/03cc1239-3988-4451-aa0d-aadb77448714/resource/d40cc921-39bb-44fd-be06-dc02589f45c6/download/uo.zip"
AMCU_PACKAGE = "https://data.gov.ua/api/3/action/package_show?id=1b98d102-0b52-44ba-882f-5f6a559ff81c"
SANCTIONS = {
    "ua_nsdc_sanctions": "РНБО: санкції",
    "ua_war_sanctions": "ГУР: «Війна і санкції»",
    "ua_sfms_blacklist": "Держфінмоніторинг: чорний список",
    "eu_fsf": "ЄС: фінансові санкції",
    "us_ofac_sdn": "США: OFAC SDN",
    "worldbank_debarred": "Світовий банк: відсторонені",
    "ebrd_ineligible": "ЄБРР: недопущені",
}
UA = "Mozilla/5.0"
EDR_EVERY = timedelta(days=7)
EDR_MAX_S = 420         # a slow line from abroad must not hold the run up
DAY = timedelta(days=1)


def _open(url, timeout=120):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout, context=spending._ctx)


def person_key(name):
    n = re.sub(r"[’'`ʼ]", "'", html.unescape(name or "")).upper()
    n = re.sub(r"\s+", " ", n).strip(" ;,.")
    return hashlib.sha256(("edr:" + n).encode("utf-8")).hexdigest()[:12] if len(n.split()) >= 2 else None


def _txt(x):
    return html.unescape(x or "").strip()


def _tag(s, tag):
    m = re.search(r"<%s>(.*?)</%s>" % (tag, tag), s, re.S)
    return m.group(1) if m else ""


def _all(s, tag):
    return re.findall(r"<%s>(.*?)</%s>" % (tag, tag), s, re.S)


def _ddmmyyyy(s):
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", s or "")
    return "%s-%s-%s" % (m.group(3), m.group(2), m.group(1)) if m else None


def parse_subject(s):
    """One <SUBJECT> of the register: what the monitor keeps of it."""
    founders, founder_codes, f_cit = [], [], set()
    for f in _all(s, "FOUNDER"):
        f = _txt(f)
        codes = re.findall(r"(?:код|ЄДРПОУ|ідентифікаційний код)[^\d]{0,30}(\d{8})\b", f, re.I)
        if codes:
            founder_codes += codes
            continue
        name = f.split(";")[0]
        if re.search(r"\b(ТОВАРИСТВО|ПІДПРИЄМСТВО|КОМПАНІ|LIMITED|LTD|GMBH|CORPORATION|INC)\b", name.upper()):
            continue
        k = person_key(name)
        if k:
            founders.append(k)
        m = re.search(r"громадянство:\s*([^;]+)", f)
        if m:
            f_cit.add(m.group(1).strip())
    bens, b_cit, absent = [], set(), None
    for b in _all(s, "BENEFICIARY"):
        b = _txt(b)
        if b.lower().startswith("причина відсутності"):
            absent = b.split(":", 1)[-1].strip()[:200]
            continue
        k = person_key(b.split(";")[0])
        if k:
            bens.append(k)
        m = re.search(r"громадянство:\s*([^;]+)", b)
        if m:
            b_cit.add(m.group(1).strip())
    signers = []
    for x in _all(s, "SIGNER"):
        k = person_key(re.split(r"\s+-\s+|;", _txt(x))[0])
        if k and k not in signers:
            signers.append(k)
    term, bank = _tag(s, "TERMINATION_STARTED_INFO"), _tag(s, "BANKRUPTCY_READJUSTMENT_INFO")
    cap = _tag(s, "AUTHORIZED_CAPITAL").replace(" ", "").replace(",", ".")
    return {k: v for k, v in {
        "name": _txt(_tag(s, "NAME"))[:300], "short": _txt(_tag(s, "SHORT_NAME"))[:160], "opf": _txt(_tag(s, "OPF")),
        "stan": _txt(_tag(s, "STAN")), "registered": _ddmmyyyy(_tag(s, "REGISTRATION")),
        "capital": float(cap) if re.fullmatch(r"\d+(\.\d+)?", cap or "") else None,
        "terminating": {"date": _ddmmyyyy(_tag(term, "OP_DATE")), "reason": _txt(_tag(term, "REASON"))[:200]} if term else None,
        "bankruptcy": {"date": _ddmmyyyy(_tag(bank, "OP_DATE")), "reason": _txt(_tag(bank, "REASON"))[:200]} if bank else None,
        "terminated": _ddmmyyyy(_tag(s, "TERMINATED_INFO")),
        "founders": sorted(set(founders)) or None, "founder_codes": sorted(set(founder_codes)) or None,
        "beneficiaries": sorted(set(bens)) or None, "ubo_absent": absent, "signers": signers or None,
        "citizenship": sorted((f_cit | b_cit) - {"Україна"}) or None,
        "n_founders": len(_all(s, "FOUNDER")) or None,
    }.items() if v not in (None, "", [])}


LIVE = ("зареєстровано", "зареєстровано, свідоцтво про державну реєстрацію недійсне")


def scan_edr(codes, log=print):
    """Stream the register's zip (one XML member, windows-1251) and keep the subjects asked for."""
    wanted = {c.encode() for c in codes}
    found = {}
    started = time.time()
    with _open(EDR_URL, timeout=60) as res:
        head = res.read(30)
        sig, _, flag, method, _, _, _, _, _, nl, el = struct.unpack("<IHHHHHIIIHH", head)
        if sig != 0x04034B50 or method != 8:
            raise RuntimeError("ЄДР: неочікуваний формат архіву")
        res.read(nl + el)
        dec, buf, read = zlib.decompressobj(-15), b"", 0
        while not dec.eof:
            chunk = res.read(1 << 20)
            if not chunk:
                break
            read += len(chunk)
            if time.time() - started > EDR_MAX_S:
                raise RuntimeError("ЄДР: за %d с прочитано лише %.0f МБ — спробуємо завтра" % (EDR_MAX_S, read / 1e6))
            buf += dec.decompress(chunk)
            cut = buf.rfind(b"</SUBJECT>")
            if cut < 0:
                continue
            block, buf = buf[:cut + 10], buf[cut + 10:]
            for m in re.finditer(rb"<EDRPOU>(\d{8})</EDRPOU>", block):
                if m.group(1) not in wanted:
                    continue
                a = block.rfind(b"<SUBJECT>", 0, m.start())
                b = block.find(b"</SUBJECT>", m.end())
                rec = parse_subject(block[a:b].decode("cp1251", "ignore"))
                code = m.group(1).decode()
                old = found.get(code)
                # A code can have old records too: the live one wins.
                if not old or (rec.get("stan") in LIVE and old.get("stan") not in LIVE):
                    found[code] = rec
    log("  ЄДР: прочитано %.0f МБ за %.0f с, знайдено %d із %d" % (read / 1e6, time.time() - started, len(found), len(codes)))
    return found


def scan_sanctions(codes, log=print):
    hits, failed = {}, 0
    for ds, title in SANCTIONS.items():
        try:
            with _open("https://data.opensanctions.org/datasets/latest/%s/targets.simple.csv" % ds) as res:
                for row in csv.DictReader(io.TextIOWrapper(res, encoding="utf-8", newline="")):
                    ids = {x.strip() for x in (row.get("identifiers") or "").split(";")}
                    for c in ids & codes:
                        hits.setdefault(c, []).append({"list": title, "name": (row.get("name") or "")[:200],
                                                       "what": (row.get("sanctions") or "")[:300], "id": row.get("id")})
        except Exception as e:  # noqa: BLE001 - one list down leaves the others
            log("  ! санкції %s: %s" % (ds, e))
            failed += 1
    if failed == len(SANCTIONS):
        raise RuntimeError("жоден список санкцій не відкрився")
    return hits


def scan_amcu(codes, log=print):
    with _open(AMCU_PACKAGE, timeout=60) as res:
        pkg = json.load(res)["result"]
    xlsx = sorted((r for r in pkg["resources"] if (r.get("format") or "").upper() == "XLSX"), key=lambda r: r.get("created") or "")[-1]["url"]
    with _open(xlsx) as res:
        z = zipfile.ZipFile(io.BytesIO(res.read()))
    ss = [html.unescape(re.sub(r"<[^>]+>", "", x)) for x in re.findall(r"<si>(.*?)</si>", z.read("xl/sharedStrings.xml").decode("utf-8"), re.S)]
    hits = {}
    for row in re.findall(r"<row[^>]*>(.*?)</row>", z.read("xl/worksheets/sheet1.xml").decode("utf-8"), re.S):
        cells = {}
        for col, attrs, v in re.findall(r'<c r="([A-Z]+)\d+"([^>]*)>(?:<f>.*?</f>)?<v>(.*?)</v>', row, re.S):
            cells[col] = ss[int(v)] if 't="s"' in attrs else v
        code = re.sub(r"\D", "", cells.get("G") or "")
        if code not in codes:
            continue
        d = cells.get("D") or ""
        day = (date(1899, 12, 30) + timedelta(days=int(float(d)))).isoformat() if re.fullmatch(r"\d+(\.0)?", d) else _ddmmyyyy(d)
        hits.setdefault(code, []).append({k: v for k, v in {"decision": cells.get("C"), "date": day, "body": (cells.get("E") or "")[:120],
                                                            "court": None if (cells.get("K") or "NA") == "NA" else cells.get("K")[:200]}.items() if v})
    return hits


def flags(rec, today, signed=None):
    """[(kind, level)] of one company's record."""
    out = []
    e = rec.get("edr") or {}
    st = (e.get("stan") or "").lower()
    if e:
        if st in ("припинено", "скасовано") or e.get("terminated"):
            out.append(("terminated", "high"))
        elif "банкрут" in st or e.get("bankruptcy"):
            out.append(("bankruptcy", "high"))
        elif "припинення" in st or e.get("terminating"):
            out.append(("terminating", "high"))
        if e.get("ubo_absent"):
            out.append(("no_ubo", "medium"))
        if set(e.get("citizenship") or []) & {"Російська Федерація", "Республіка Білорусь", "Білорусь"}:
            out.append(("ru_owner", "high"))
        ref = signed or today
        if e.get("registered") and e["registered"] > (date.fromisoformat(ref[:10]) - timedelta(days=365)).isoformat():
            out.append(("young", "medium"))
    if rec.get("sanctions"):
        out.append(("sanctions", "high"))
    for a in rec.get("amcu") or []:
        recent = a.get("date") and a["date"] >= (date.fromisoformat(today) - timedelta(days=3 * 365)).isoformat()
        out.append(("amcu_rigging", "high" if recent else "medium"))
        break
    return out


def load(data_dir):
    try:
        with open(os.path.join(data_dir, "legal.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"items": {}}


def sync(codes, data_dir, log=print):
    """Refresh what is due: the ЄДР weekly (or the next day for new codes), sanctions daily, AMCU weekly."""
    codes = {c for c in codes if c and re.fullmatch(r"\d{8}", c)}
    path = os.path.join(data_dir, "legal.json")
    old = load(data_dir)
    items = {c: dict(v) for c, v in (old.get("items") or {}).items() if c in codes}
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    ago = lambda key, delta: (old.get(key) or "") < time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - delta.total_seconds()))
    new = {c for c in codes if "edr" not in items.get(c, {})}
    out = dict(old, items=items)
    # data.gov.ua turns automated clients away at times: a failed try waits a day.
    if codes and (ago("edr_at", EDR_EVERY) or (new and ago("edr_at", DAY))) and ago("edr_tried", DAY):
        out["edr_tried"] = now
        try:
            found = scan_edr(codes, log)
            for c in codes:
                if c in found:
                    items.setdefault(c, {})["edr"] = found[c]
            out["edr_at"] = now
        except Exception as e:  # noqa: BLE001 - keep last week's
            log("  ! ЄДР: %s" % e)
    if codes and (ago("sanctions_at", DAY) or new):
        try:
            hits = scan_sanctions(codes, log)
            for c in codes:
                items.setdefault(c, {})["sanctions"] = hits.get(c) or []
            out["sanctions_at"] = now
        except Exception as e:  # noqa: BLE001
            log("  ! санкції: %s" % e)
    if codes and (ago("amcu_at", EDR_EVERY) or new) and ago("amcu_tried", DAY):
        out["amcu_tried"] = now
        try:
            hits = scan_amcu(codes, log)
            for c in codes:
                items.setdefault(c, {})["amcu"] = hits.get(c) or []
            out["amcu_at"] = now
        except Exception as e:  # noqa: BLE001
            log("  ! АМКУ: %s" % e)
    for c in codes:
        rec = items.get(c)
        if rec:
            rec["flags"] = [{"kind": k, "level": lv} for k, lv in flags(rec, time.strftime("%Y-%m-%d"))]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    log("Юридичний статус: компаній %d (ЄДР %s, санкції %s, АМКУ %s)" % (len(codes), out.get("edr_at", "—"), out.get("sanctions_at", "—"), out.get("amcu_at", "—")))
    return out
