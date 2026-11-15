#!/usr/bin/env python3
"""Refresh the site's data files from spending.gov.ua.

The site is static: this script is the only thing that talks to the portal on
a schedule. It reads the watch list (data/orgs.json), pulls new records for
every organisation and rewrites the JSON files the pages load.

The first sync of an organisation is a backfill (history, no feed events).
Every later sync re-reads a short overlapping window; records not seen before
become feed events.

Usage:  python3 sync/sync.py [--add EDRPOU [--note TEXT]] [--remove EDRPOU]
"""
import argparse
import json
import os
import re
import shutil
import sys
import traceback
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import analysis  # noqa: E402
import spending  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.environ.get("DATA_DIR") or os.path.join(ROOT, "data")
ORGS_FILE = os.path.join(DATA, "orgs.json")
STATE_FILE = os.path.join(DATA, "state.json")
NAMES_FILE = os.path.join(DATA, "names.json")
INDEX_FILE = os.path.join(DATA, "index.json")
FEED_FILE = os.path.join(DATA, "feed.json")
SIGNALS_FILE = os.path.join(DATA, "signals.json")
ORG_DIR = os.path.join(DATA, "org")

DOC_KINDS = ("contract", "act", "addendum", "peny")
KINDS = ("transaction",) + DOC_KINDS + ("liability", "report")
TX_BACKFILL_DAYS = 92
DOC_BACKFILL_DAYS = 365
LIABILITY_BACKFILL_DAYS = 365
OVERLAP_DAYS = {"transaction": 7, "doc": 5, "liability": 7}
FEED_SIZE = 500
NAME_LOOKUPS_PER_ORG = 300
FILE_RE = re.compile(r"^(%s)-(\d{4}|nodate)\.json$" % "|".join(KINDS))


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def write_json(path, value, pretty=False):
    """Write only when the content changed, so untouched files make no commit."""
    if pretty:
        text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    else:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    try:
        with open(path, encoding="utf-8") as f:
            if f.read() == text:
                return False
    except FileNotFoundError:
        pass
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)
    return True


def strip_nulls(value):
    """Drop null fields: the portal pads every record with dozens of them."""
    if isinstance(value, dict):
        return {k: strip_nulls(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [strip_nulls(v) for v in value]
    return value


def clean_edrpou(value):
    code = re.sub(r"\s+", "", str(value or ""))
    if not re.match(r"^\d{8,10}$", code):
        raise SystemExit("ЄДРПОУ — это 8 цифр (для ФОП — 10 цифр): %r" % value)
    return code


def load_watchlist():
    """The watch list, de-duplicated, as [{"edrpou", "note"}]."""
    seen, out = set(), []
    for entry in read_json(ORGS_FILE, []):
        if isinstance(entry, str):
            entry = {"edrpou": entry}
        code = re.sub(r"\s+", "", str(entry.get("edrpou") or ""))
        if not re.match(r"^\d{8,10}$", code) or code in seen:
            if code not in seen:
                print("! пропускаю некорректный код в orgs.json: %r" % entry.get("edrpou"))
            continue
        seen.add(code)
        out.append({"edrpou": code, "note": str(entry.get("note") or "")[:500]})
    return out


class OrgStore:
    """One organisation's records, kept in files split by kind and year.

    Past years stop changing, so a sync rewrites only the current files and
    the repository does not grow with every run.
    """

    def __init__(self, edrpou):
        self.edrpou = edrpou
        self.dir = os.path.join(ORG_DIR, edrpou)
        self.items = {}
        if os.path.isdir(self.dir):
            for name in os.listdir(self.dir):
                if FILE_RE.match(name):
                    for item in read_json(os.path.join(self.dir, name), []):
                        self.items[(item["kind"], item["ext_id"])] = item

    def add(self, kind, raws, as_event, cached_name):
        """Store records not seen before; returns how many were new."""
        new, now = 0, now_iso()
        for raw in raws:
            n = spending.normalize(kind, raw, self.edrpou, cached_name)
            if not n["ext_id"] or n["ext_id"] == "None" or (kind, n["ext_id"]) in self.items:
                continue
            n.update(kind=kind, first_seen_at=now, is_event=1 if as_event else 0, data=strip_nulls(raw))
            self.items[(kind, n["ext_id"])] = n
            new += 1
        return new

    def save(self):
        """Write the files; returns {kind: [years, newest first]}."""
        groups = {}
        for item in self.items.values():
            year = (item.get("date") or "")[:4]
            year = year if re.match(r"^\d{4}$", year) else "nodate"
            groups.setdefault((item["kind"], year), []).append(item)
        wanted = set()
        for (kind, year), items in groups.items():
            items.sort(key=lambda i: (i.get("date") or "", i["ext_id"]), reverse=True)
            name = "%s-%s.json" % (kind, year)
            wanted.add(name)
            write_json(os.path.join(self.dir, name), items)
        if os.path.isdir(self.dir):
            for name in os.listdir(self.dir):
                if FILE_RE.match(name) and name not in wanted:
                    os.remove(os.path.join(self.dir, name))
        files = {}
        for kind, year in sorted(groups, reverse=True):
            files.setdefault(kind, []).append(year)
        return files

    def stats(self):
        acc = {}
        for item in self.items.values():
            s = acc.setdefault(
                (item["kind"], item["role"]),
                {"kind": item["kind"], "role": item["role"], "count": 0, "sum": 0.0, "first": None, "last": None},
            )
            s["count"] += 1
            if item.get("currency") == "UAH" and item.get("amount") is not None:
                s["sum"] += item["amount"]
            d = item.get("date")
            if d:
                s["first"] = d if not s["first"] or d < s["first"] else s["first"]
                s["last"] = d if not s["last"] or d > s["last"] else s["last"]
        for s in acc.values():
            s["sum"] = round(s["sum"], 2)
        return [acc[k] for k in sorted(acc)]


def streams():
    out = [("transaction", "payer"), ("transaction", "recipient")]
    for kind in DOC_KINDS:
        out.append((kind, "disposer"))
        out.append((kind, "contractor"))
    out.append(("liability", "payer"))
    out.append(("report", "owner"))
    return out


def fetch_stream(edrpou, kind, role, last):
    """Records of one stream: a backfill when `last` is None, else the recent window."""
    today = spending.today()
    end = today + timedelta(days=1)  # Kyiv is ahead of UTC
    if kind == "transaction":
        start = last - timedelta(days=OVERLAP_DAYS["transaction"]) if last else today - timedelta(days=TX_BACKFILL_DAYS)
        return spending.fetch_transactions(edrpou, role, start, end)
    if kind in DOC_KINDS:
        if last:
            return spending.fetch_documents(kind, edrpou, role, last - timedelta(days=OVERLAP_DAYS["doc"]), end)[0]
        return spending.fetch_documents_history(kind, edrpou, role, DOC_BACKFILL_DAYS)[0]
    if kind == "liability":
        start = last - timedelta(days=OVERLAP_DAYS["liability"]) if last else today - timedelta(days=LIABILITY_BACKFILL_DAYS)
        return spending.fetch_liabilities(edrpou, start, end)
    return spending.fetch_reports(edrpou)


def resolve_names(store, names):
    """Fill in counterparty names the portal gives only as a code.

    Documents where the tracked organisation is the contractor carry just the
    disposer's EDRPOU. Each name costs one request, so the work is bounded per
    run and the rest is picked up by later runs.
    """
    budget = NAME_LOOKUPS_PER_ORG
    for item in store.items.values():
        code = item.get("cp_edrpou")
        if item.get("cp_name") is not None or not code:
            continue
        if code not in names:
            if budget <= 0:
                continue
            budget -= 1
            try:
                card = spending.fetch_card(code)
            except spending.ApiError:
                continue  # transient failure: try again next run
            # "" marks "looked up, the portal has no name" so it is not retried forever.
            names[code] = (card or {}).get("orgName") or ""
        item["cp_name"] = names[code]


def sync_org(entry, org_state, names):
    """Sync one organisation. Returns (index entry, new event count, error or None, events)."""
    edrpou = entry["edrpou"]
    store = OrgStore(edrpou)
    stream_state = org_state.setdefault("streams", {})
    new_events, errors = 0, []

    try:
        card = spending.fetch_card(edrpou)
        if card:
            org_state["card"] = strip_nulls(card)
            org_state["name"] = card.get("orgName") or org_state.get("name")
    except spending.ApiError:
        pass  # the card is cosmetic; keep the old one

    def cached_name(code):
        return names.get(code)

    for kind, role in streams():
        stream = "%s:%s" % (kind, role)
        last = spending.parse_date(stream_state[stream]) if stream in stream_state else None
        try:
            raws = fetch_stream(edrpou, kind, role, last)
            new = store.add(kind, raws, last is not None, cached_name)
            stream_state[stream] = spending.today().isoformat()
            new_events += new if last is not None else 0
            print("  %-22s %5d получено, %d новых" % (stream, len(raws), new), flush=True)
        except spending.ApiError as e:
            errors.append("%s: %s" % (stream, e))
            print("  %-22s ОШИБКА: %s" % (stream, e), flush=True)
        except Exception as e:  # keep the other streams going
            traceback.print_exc()
            errors.append("%s: %s" % (stream, e))

    try:
        resolve_names(store, names)
    except Exception:
        traceback.print_exc()

    # An organisation unknown to the portal gets its name from its own payments.
    if not org_state.get("name"):
        for item in store.items.values():
            if item["kind"] == "transaction":
                key = "payer_name" if item["role"] == "payer" else "recipt_name"
                if item["data"].get(key):
                    org_state["name"] = item["data"][key]
                    break

    files = store.save()
    report = analysis.analyze(list(store.items.values()), edrpou)
    write_json(os.path.join(store.dir, "analysis.json"), report)
    error = "; ".join(errors)[:1000] if errors else None
    org_state.update(
        backfill_done=True, last_sync_at=now_iso(), status="error" if errors else "ok", error=error
    )
    index_entry = {
        "edrpou": edrpou,
        "name": org_state.get("name") or edrpou,
        "note": entry["note"],
        "card": org_state.get("card"),
        "last_sync_at": org_state["last_sync_at"],
        "status": org_state["status"],
        "error": error,
        "stats": store.stats(),
        "files": files,
        "signals": report["counts"],
        "totals": report["totals"],
    }
    events = [dict(i, org_edrpou=edrpou, org_name=index_entry["name"]) for i in store.items.values() if i["is_event"]]
    signals = [dict(s, org_edrpou=edrpou, org_name=index_entry["name"]) for s in report["signals"]]
    return index_entry, new_events, error, events, signals


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--add", default="", help="add an organisation (EDRPOU) to the watch list")
    parser.add_argument("--note", default="", help="note for the organisation being added")
    parser.add_argument("--remove", default="", help="remove an organisation (EDRPOU) from the watch list")
    args = parser.parse_args()

    watch = load_watchlist()
    if args.remove.strip():
        code = clean_edrpou(args.remove)
        watch = [w for w in watch if w["edrpou"] != code]
    if args.add.strip():
        code = clean_edrpou(args.add)
        if not any(w["edrpou"] == code for w in watch):
            watch.append({"edrpou": code, "note": args.note.strip()[:500]})
    write_json(ORGS_FILE, watch, pretty=True)

    state = read_json(STATE_FILE, {})
    org_states = state.setdefault("orgs", {})
    names = read_json(NAMES_FILE, {})
    started = now_iso()

    # Forget organisations that left the watch list, together with their files.
    tracked = {w["edrpou"] for w in watch}
    for code in [c for c in org_states if c not in tracked]:
        del org_states[code]
    if os.path.isdir(ORG_DIR):
        for name in os.listdir(ORG_DIR):
            if name not in tracked and re.match(r"^\d{8,10}$", name):
                shutil.rmtree(os.path.join(ORG_DIR, name))

    index_orgs, feed, all_signals, new_total, failed = [], [], [], 0, 0
    for entry in watch:
        print("%s %s" % (entry["edrpou"], org_states.get(entry["edrpou"], {}).get("name") or ""), flush=True)
        try:
            index_entry, new, error, events, signals = sync_org(entry, org_states.setdefault(entry["edrpou"], {}), names)
        except Exception as e:
            traceback.print_exc()
            failed += 1
            st = org_states[entry["edrpou"]]
            st.update(status="error", error=str(e)[:1000], last_sync_at=now_iso())
            index_orgs.append({
                "edrpou": entry["edrpou"], "name": st.get("name") or entry["edrpou"], "note": entry["note"],
                "card": st.get("card"), "last_sync_at": st["last_sync_at"], "status": "error",
                "error": st["error"], "stats": [], "files": {},
            })
            continue
        index_orgs.append(index_entry)
        feed.extend(events)
        all_signals.extend(signals)
        new_total += new
        failed += 1 if error else 0

    feed.sort(key=lambda i: (i["first_seen_at"], i.get("date") or "", i["ext_id"]), reverse=True)
    runs = state.setdefault("runs", [])
    runs.insert(0, {
        "started_at": started, "finished_at": now_iso(), "orgs_total": len(watch),
        "orgs_failed": failed, "new_items": new_total,
        "trigger": os.environ.get("GITHUB_EVENT_NAME") or "local",
    })
    del runs[20:]

    index_orgs.sort(key=lambda o: o["name"].lower())
    write_json(STATE_FILE, state)
    write_json(NAMES_FILE, names)
    write_json(FEED_FILE, {"items": feed[:FEED_SIZE], "total": len(feed)})
    all_signals.sort(key=lambda x: (analysis.SEVERITY_ORDER[x["severity"]], -(x.get("amount") or 0)))
    write_json(SIGNALS_FILE, {"items": all_signals})
    write_json(INDEX_FILE, {
        "generated_at": now_iso(),
        "repo": os.environ.get("GITHUB_REPOSITORY") or "",
        "orgs": index_orgs,
        "runs": runs[:10],
        "treasury_last_load": spending.last_load(),
    })
    print("Готово: организаций %d, с ошибками %d, новых записей %d" % (len(watch), failed, new_total))


if __name__ == "__main__":
    main()
