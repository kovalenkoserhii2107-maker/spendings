#!/usr/bin/env python3
"""Refresh the site's data files from spending.gov.ua.

The site is static: this script is the only thing that talks to the portal on
a schedule. It reads the watch list (data/orgs.json), pulls new records for
every organisation and rewrites the JSON files the pages load.

The first sync of an organisation is a backfill (history, no feed events).
Every later sync re-reads a short overlapping window; records not seen before
become feed events.

Organisations are also added from the app. Each user's lists are private; the app
copies only organisation codes and contract ids into the anonymous public list
pub/{sha256("monitor:" + uid)}, which every run merges into the watch list.
`--check` only reports whether something new is waiting (for the frequent
workflow schedule).

Usage:  python3 sync/sync.py [--add EDRPOU [--note TEXT]] [--remove EDRPOU] [--check]
"""
import argparse
import json
import os
import time
import re
import shutil
import sys
import traceback
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import analysis  # noqa: E402
import contractor  # noqa: E402
import legal  # noqa: E402
import eib  # noqa: E402
import prozorro  # noqa: E402
import tracked  # noqa: E402
import spending  # noqa: E402
import subvention  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.environ.get("DATA_DIR") or os.path.join(ROOT, "data")
ORGS_FILE = os.path.join(DATA, "orgs.json")
STATE_FILE = os.path.join(DATA, "state.json")
NAMES_FILE = os.path.join(DATA, "names.json")
INDEX_FILE = os.path.join(DATA, "index.json")
FEED_FILE = os.path.join(DATA, "feed.json")
SIGNALS_FILE = os.path.join(DATA, "signals.json")
ORG_DIR = os.path.join(DATA, "org")
REMOVED_FILE = os.path.join(DATA, "removed.json")
TRACKED_DIR = os.path.join(DATA, "tracked")
EIB_FILE = os.path.join(DATA, "eib.json")
TENDERS, TREASURY = {}, {}  # per organisation, filled while syncing, read by the contracts on control

# An organisation on monitoring: its contracts, payments and, for reconciliation, acts and
# addendums. Everything else about a contract is read once it is taken on control.
DOC_KINDS = ("contract", "act", "addendum")
KINDS = ("transaction",) + DOC_KINDS
DROPPED_RE = re.compile(r"^(peny|liability|report)-(\d{4}|nodate)\.json$")  # kinds kept before v0.15
TX_BACKFILL_DAYS = 92
DOC_BACKFILL_DAYS = 365
LIABILITY_BACKFILL_DAYS = 365
OVERLAP_DAYS = {"transaction": 7, "doc": 5, "liability": 7}
FEED_SIZE = 500
NAME_LOOKUPS_PER_ORG = 300
FILE_RE = re.compile(r"^(%s)-(\d{4}|nodate)\.json$" % "|".join(KINDS))
PZ_FILE_RE = re.compile(r"^prozorro-(\d{4}|nodate)\.json$")
SKIP_PROZORRO = os.environ.get("SKIP_PROZORRO") == "1"


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
    """The watch list, de-duplicated, as [{"edrpou", "note", "role"}].

    "role" is "buyer" (a fund holder: its procurement and payments out) or
    "supplier" (its contracts with many buyers and payments in).
    """
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
        item = {"edrpou": code, "note": str(entry.get("note") or "")[:500],
                "role": "supplier" if entry.get("role") == "supplier" else "buyer"}
        if entry.get("claimed"):
            item["claimed"] = True  # followed by users in the app; dropped when none is left
        out.append(item)
    return out


def app_orgs():
    """Organisations users follow in the app ({edrpou: {"role", "owners"}}), from the
    anonymous public lists; None when Firestore cannot be read (then nothing changes)."""
    try:
        return tracked.read_pub()[0]
    except Exception as e:
        print("! списки з додатка недоступні: %s" % e)
        return None


def merge_watch(watch, orgs):
    """The watch list after the app: organisations someone follows are added (and
    marked claimed); a claimed one nobody follows any more is dropped. Entries added
    by hand (orgs.json, the workflow) stay until removed by hand."""
    if orgs is None:
        return watch, []
    out, added = [], []
    for w in watch:
        if w["edrpou"] in orgs:
            w["claimed"] = True
        elif w.get("claimed"):
            print("- %s (ніхто в додатку більше не стежить)" % w["edrpou"])
            continue
        out.append(w)
    known = {w["edrpou"] for w in out}
    for code, o in sorted(orgs.items()):
        if code not in known:
            out.append({"edrpou": code, "note": "", "role": o["role"], "claimed": True})
            added.append(code)
            print("+ %s (додано в додатку)" % code)
    return out, added


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
                if DROPPED_RE.match(name):
                    os.remove(os.path.join(self.dir, name))
                elif FILE_RE.match(name):
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


def load_prozorro(org_dir):
    """The organisation's Prozorro procedures as {tenderID: record}."""
    out = {}
    if os.path.isdir(org_dir):
        for name in os.listdir(org_dir):
            if PZ_FILE_RE.match(name):
                for t in read_json(os.path.join(org_dir, name), []):
                    out[t["tid"]] = t
    return out


def save_prozorro(org_dir, tenders):
    """Write prozorro-<year>.json files; returns the years, newest first."""
    groups = {}
    for t in tenders.values():
        year = (t.get("date") or "")[:4]
        groups.setdefault(year if re.match(r"^\d{4}$", year) else "nodate", []).append(t)
    for year, items in groups.items():
        items.sort(key=lambda t: (t.get("date") or "", t["tid"]), reverse=True)
        write_json(os.path.join(org_dir, "prozorro-%s.json" % year), items)
    if os.path.isdir(org_dir):
        for name in os.listdir(org_dir):
            m = PZ_FILE_RE.match(name)
            if m and m.group(1) not in groups:
                os.remove(os.path.join(org_dir, name))
    return sorted(groups, reverse=True)


def sync_prozorro(edrpou, org_dir, org_state, report, role="buyer"):
    """Procurement data for one organisation, linked to its Treasury contracts.

    Writes the files, marks linked contracts in `report` ("pz": tenderID) and
    returns (years, summary for the index).
    """
    tenders = load_prozorro(org_dir)
    pz_state = org_state.setdefault("prozorro", {})
    errors = []
    if not SKIP_PROZORRO:
        try:
            errors = prozorro.sync(edrpou, tenders, pz_state, log=lambda m: print(m, flush=True), role=role)
        except Exception as e:  # Prozorro trouble must not cost the Treasury data
            traceback.print_exc()
            errors = [str(e)]
    links = prozorro.link(tenders, report["contracts"], role)
    TENDERS[edrpou] = tenders
    TREASURY[edrpou] = {c["id"]: c for c in report["contracts"]}
    for c in report["contracts"]:
        if c["id"] in links:
            tid, pcid = links[c["id"]]
            c["pz"] = tid
            # Prozorro holds the current price: the Treasury's should agree with it.
            pc = next((x for x in (tenders.get(tid) or {}).get("contracts") or [] if x.get("id") == pcid), {})
            pz_value = (pc.get("value") or {}).get("amount") if (pc.get("value") or {}).get("currency", "UAH") == "UAH" else None
            sig = analysis.pz_mismatch(c, pz_value)
            if sig:
                c["flags"].append("pz_treasury_mismatch")
                report["signals"].append(sig)
                report["counts"][sig["severity"]] = report["counts"].get(sig["severity"], 0) + 1
    years = save_prozorro(org_dir, tenders) if tenders else []
    contracts = [c for t in tenders.values() for c in t.get("contracts") or []]
    pz_state["errors"] = errors[:10]
    summary = {
        "tenders": len(tenders),
        "contracts": len(contracts),
        "linked": len(links),
        "value": round(sum((c.get("value") or {}).get("amount") or 0 for c in contracts
                           if (c.get("value") or {}).get("currency", "UAH") == "UAH"), 2),
        "queue": len(pz_state.get("queue") or []),
        "error": "; ".join(errors[:3])[:500] if errors else None,
    }
    return years, summary


TRACKED_BUDGET_S = {"full": 20 * 60, "tracked": 30 * 60}  # the full run has the organisations too (120 min in all)


def sync_tracked(mode="full"):
    """Re-read the contracts on control; returns the summary rows (or None when the list in
    Firestore could not be read, so the old files stay).

    New picks go first, then the ones read longest ago, within a time budget: with hundreds
    on control a run reads what it can, the rest keep their last snapshot until the next run.
    """
    try:
        wanted = tracked.requests_from_app()
    except Exception as e:
        print("! договори на контролі недоступні: %s" % e)
        return None
    started, budget = time.time(), TRACKED_BUDGET_S.get(mode, TRACKED_BUDGET_S["full"])
    olds = {req["key"]: read_json(os.path.join(TRACKED_DIR, req["key"] + ".json"), None) for req in wanted}
    wanted.sort(key=lambda r: (olds[r["key"]] is not None, (olds[r["key"]] or {}).get("synced_at") or ""))
    rows, keep, skipped = [], set(), 0
    print("Договори на контролі: %d" % len(wanted), flush=True)
    for req in wanted:
        path = os.path.join(TRACKED_DIR, req["key"] + ".json")
        old = olds[req["key"]]
        keep.add(req["key"] + ".json")
        if time.time() - started > budget:
            skipped += 1
            if old:  # next run; who follows it may have changed meanwhile
                old = dict(old, viewers=req.get("viewers") or [], owners=req.get("owners") or [])
                write_json(path, old)
                rows.append(dict(tracked.index_row(old), error=old.get("error")))
            continue
        try:
            snap = tracked.sync_one(req, old, TENDERS, TREASURY, log=lambda m: print(m, flush=True))
        except Exception as e:  # keep the last good snapshot and say what failed
            traceback.print_exc()
            if not old:
                continue
            snap = dict(old, error=str(e)[:500], viewers=req.get("viewers") or [], owners=req.get("owners") or [])
            snap.pop("followers", None)
            snap.pop("note", None)
        else:
            snap.pop("error", None)
            tracked.stamp_signals(snap, old, now_iso())
        snap["synced_at"] = now_iso()
        write_json(path, snap)
        rows.append(dict(tracked.index_row(snap), error=snap.get("error")))
    if skipped:
        print("Не встигли за цей запуск: %d (наступного разу — першими)" % skipped, flush=True)
    # Snapshots of contracts nobody follows stay on disk (out of the index): if the
    # contract is put on control again, its history goes on where it stopped.
    # The contractors' profiles (each read again after a week).
    try:
        contractor.sync([r.get("supplier") for r in rows], DATA, spending.today().isoformat(),
                        budget_s=240 if mode == "full" else 90, log=lambda m: print(m, flush=True))
    except Exception:  # noqa: BLE001 - profiles are extra, the snapshots stand
        traceback.print_exc()
    # Legal standing of the contractors, the other bidders and the buyers.
    if mode == "full":
        try:
            codes = set()
            for r in rows:
                codes |= {r.get("supplier"), r.get("org")}
                snap = read_json(os.path.join(TRACKED_DIR, r["key"] + ".json"), None) or {}
                codes |= set((snap.get("tender") or {}).get("bidder_codes") or [])
            legal.sync(codes, DATA, log=lambda m: print(m, flush=True))
        except Exception:  # noqa: BLE001
            traceback.print_exc()
    rows.sort(key=lambda r: (r.get("changed_at") or "", r["key"]), reverse=True)
    write_json(os.path.join(TRACKED_DIR, "index.json"), {"generated_at": now_iso(), "items": rows})
    return rows


def streams():
    out = [("transaction", "payer"), ("transaction", "recipient")]
    for kind in DOC_KINDS:
        out.append((kind, "disposer"))
        out.append((kind, "contractor"))
    return out


def fetch_stream(edrpou, kind, role, last):
    """Records of one stream: a backfill when `last` is None, else the recent window."""
    today = spending.today()
    end = today + timedelta(days=1)  # Kyiv is ahead of UTC
    if kind == "transaction":
        start = last - timedelta(days=OVERLAP_DAYS["transaction"]) if last else today - timedelta(days=TX_BACKFILL_DAYS)
        return spending.fetch_transactions(edrpou, role, start, end)
    if last:
        return spending.fetch_documents(kind, edrpou, role, last - timedelta(days=OVERLAP_DAYS["doc"]), end)[0]
    return spending.fetch_documents_history(kind, edrpou, role, DOC_BACKFILL_DAYS)[0]


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
    for stream in [k for k in stream_state if tuple(k.split(":")) not in streams()]:
        del stream_state[stream]  # a kind no longer kept for organisations
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
    pz_years, pz_summary = sync_prozorro(edrpou, store.dir, org_state, report, entry["role"])
    if pz_years:
        files["prozorro"] = pz_years
    if not org_state.get("name"):  # a supplier unknown to the Treasury: its name as Prozorro has it
        for t in TENDERS.get(edrpou, {}).values():
            for c in t.get("contracts") or []:
                for s in c.get("suppliers") or []:
                    if s.get("code") == edrpou and s.get("name"):
                        org_state["name"] = s["name"]
    write_json(os.path.join(store.dir, "analysis.json"), report)
    error = "; ".join(errors)[:1000] if errors else None
    org_state.update(
        backfill_done=True, last_sync_at=now_iso(), status="error" if errors else "ok", error=error
    )
    index_entry = {
        "edrpou": edrpou,
        "name": org_state.get("name") or edrpou,
        "note": entry["note"],
        "role": entry["role"],
        "card": org_state.get("card"),
        "last_sync_at": org_state["last_sync_at"],
        "status": org_state["status"],
        "error": error,
        "stats": store.stats(),
        "files": files,
        "signals": report["counts"],
        "totals": report["totals"],
        "prozorro": pz_summary,
    }
    events = [dict(i, org_edrpou=edrpou, org_name=index_entry["name"]) for i in store.items.values() if i["is_event"]]
    signals = [dict(s, org_edrpou=edrpou, org_name=index_entry["name"]) for s in report["signals"]]
    return index_entry, new_events, error, events, signals


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--add", default="", help="add an organisation (EDRPOU) to the watch list")
    parser.add_argument("--note", default="", help="note for the organisation being added")
    parser.add_argument("--role", default="buyer", help="role of the organisation being added: buyer or supplier")
    parser.add_argument("--remove", default="", help="remove an organisation (EDRPOU) from the watch list")
    parser.add_argument("--check", action="store_true", help="only report whether the app has new requests")
    parser.add_argument("--tracked-only", action="store_true",
                        help="re-read only the contracts and procurements on control (a minute or two, for new picks)")
    args = parser.parse_args()

    watch = load_watchlist()
    removed = read_json(REMOVED_FILE, {})
    if args.check:
        _, pending = merge_watch([dict(w) for w in watch], app_orgs())
        print("Нові організації з додатка: %s" % (", ".join(pending) or "немає"))
        # Contracts put on control that the site has not got yet.
        try:
            done = {r["key"] for r in read_json(os.path.join(TRACKED_DIR, "index.json"), {}).get("items") or []}
            new_tracked = [r["key"] for r in tracked.requests_from_app() if r["key"] not in done]
        except Exception as e:
            print("! договори на контролі недоступні: %s" % e)
            new_tracked = []
        print("Нові договори на контролі: %d" % len(new_tracked))
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                f.write("run=%s\n" % ("true" if pending or new_tracked else "false"))
                # Only new contracts on control: the quick run is enough.
                f.write("mode=%s\n" % ("full" if pending else "tracked"))
        return
    if args.tracked_only:
        rows = sync_tracked("tracked")
        index = read_json(INDEX_FILE, {})
        if index and rows is not None:
            # A new data version, so browsers fetch the fresh files.
            index.update(generated_at=now_iso(), tracked=len(rows))
            write_json(INDEX_FILE, index)
        print("Готово: договорів на контролі %d" % len(rows or []))
        return
    if args.remove.strip():
        code = clean_edrpou(args.remove)
        watch = [w for w in watch if w["edrpou"] != code]
        removed[code] = now_iso()
        write_json(REMOVED_FILE, removed, pretty=True)
    watch, _ = merge_watch(watch, app_orgs())
    if args.add.strip():
        code = clean_edrpou(args.add)
        if not any(w["edrpou"] == code for w in watch):
            watch.append({"edrpou": code, "note": args.note.strip()[:500], "role": "supplier" if args.role == "supplier" else "buyer"})
    write_json(ORGS_FILE, watch, pretty=True)

    state = read_json(STATE_FILE, {})
    org_states = state.setdefault("orgs", {})
    names = read_json(NAMES_FILE, {})
    started = now_iso()

    # Forget organisations that left the watch list, together with their files.
    codes = {w["edrpou"] for w in watch}
    for code in [c for c in org_states if c not in codes]:
        del org_states[code]
    if os.path.isdir(ORG_DIR):
        for name in os.listdir(ORG_DIR):
            if name not in codes and re.match(r"^\d{8,10}$", name):
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
                "edrpou": entry["edrpou"], "name": st.get("name") or entry["edrpou"], "note": entry["note"], "role": entry["role"],
                "card": st.get("card"), "last_sync_at": st["last_sync_at"], "status": "error",
                "error": st["error"], "stats": [], "files": {},
            })
            continue
        index_orgs.append(index_entry)
        feed.extend(events)
        all_signals.extend(signals)
        new_total += new
        failed += 1 if error else 0

    tracked_rows = sync_tracked("full")
    if not SKIP_PROZORRO:
        try:
            found = eib.sync(read_json(EIB_FILE, None), log=lambda m: print(m, flush=True))
            if found:
                write_json(EIB_FILE, found)
        except Exception:
            traceback.print_exc()
    # The CMU orders spreading the EIB programmes' subvention, with all their editions.
    try:
        subvention.sync(os.path.join(DATA, "subvention.json"), log=lambda m: print(m, flush=True))
    except Exception:
        traceback.print_exc()
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
        "tracked": len(tracked_rows if tracked_rows is not None else read_json(os.path.join(TRACKED_DIR, "index.json"), {}).get("items") or []),
    })
    print("Готово: организаций %d, с ошибками %d, новых записей %d" % (len(watch), failed, new_total))


if __name__ == "__main__":
    main()
