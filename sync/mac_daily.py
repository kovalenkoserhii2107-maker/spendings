"""The daily run on the team's Mac: what the servers abroad cannot reach.

GitHub's runners are turned away by data.rada.gov.ua (the CMU subvention orders) and, at times, by
data.gov.ua (the state register). From a Mac in Ukraine both answer, so once a day this:
  - reads the subvention orders            → data/subvention.json
  - reads the state register for the companies of the contracts on control (contractors,
    other bidders, buyers)                   → data/edr.json
The site's own sync folds data/edr.json into data/legal.json and the contract cards.
Neither file is written by the GitHub run, so the two never overwrite each other.

Run by tools/mac-daily.sh (launchd, every morning).
"""
import glob
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import legal  # noqa: E402
import subvention  # noqa: E402

DATA = os.path.join(HERE, "..", "data")


def codes_on_control():
    """Contractors, buyers and the other bidders of the contracts and procurements on control."""
    out = set()
    try:
        with open(os.path.join(DATA, "tracked", "index.json"), encoding="utf-8") as f:
            rows = json.load(f).get("items") or []
    except (OSError, ValueError):
        rows = []
    for r in rows:
        out |= {r.get("supplier"), r.get("org"), r.get("buyer")}
        try:
            with open(os.path.join(DATA, "tracked", r["key"] + ".json"), encoding="utf-8") as f:
                snap = json.load(f)
            out |= set((snap.get("tender") or {}).get("bidder_codes") or [])
            # the technical supervision and the consulting engineer: are they independent of the contractor
            out |= {(x.get("supplier") or {}).get("code") for x in snap.get("related") or [] if x.get("supplier")}
        except (OSError, ValueError, KeyError):
            pass
    return {c for c in out if c and len(c) == 8 and c.isdigit()}


def main():
    log = lambda m: print(time.strftime("%H:%M:%S"), m, flush=True)  # noqa: E731
    ok = True
    try:
        subvention.sync(os.path.join(DATA, "subvention.json"), log=log)
    except Exception as e:  # noqa: BLE001
        ok = False
        log("! субвенція: %s" % e)
    codes = codes_on_control()
    log("ЄДР: компаній на контролі %d" % len(codes))
    # The register: from the site, or from a copy downloaded in the browser into Downloads
    # (data.gov.ua turns automated downloads away at times). The copy is read when it is newer than
    # the last reading, or when companies came on control that were never read: an older copy
    # still tells their state, and what a newer reading said of the others is kept.
    try:
        with open(os.path.join(DATA, "edr.json"), encoding="utf-8") as f:
            prev = json.load(f)
    except (OSError, ValueError):
        prev = {}
    last = prev.get("at") or ""
    known = set(prev.get("items") or {}) | set(prev.get("missing") or [])
    copies = sorted(glob.glob(os.path.expanduser("~/Downloads/uo*.zip")), key=os.path.getmtime)
    newest = copies[-1] if copies else None
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(os.path.getmtime(newest))) if newest else ""
    local = newest if newest and (stamp > last or (codes - known)) else None
    if codes:
        try:
            older, src = False, "site"
            try:
                found = legal.scan_edr(codes, log)
            except Exception as e:  # noqa: BLE001
                if not local:
                    raise
                log("  ЄДР з сайту: %s — читаю завантажену копію %s (%s)" % (e, os.path.basename(local), stamp[:10]))
                found = legal.scan_edr(codes, log, path=local)
                older, src = stamp <= last, "copy " + stamp[:10]
            items = dict(found)
            if older:
                # A copy older than the last reading only fills in the companies that reading lacked.
                items = dict(found, **(prev.get("items") or {}))
            out = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "items": {c: v for c, v in items.items() if c in codes},
                   "missing": sorted(codes - set(items)), "source": src}
            with open(os.path.join(DATA, "edr.json"), "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
            log("  ЄДР: знайдено %d з %d" % (len(out["items"]), len(codes)))
        except Exception as e:  # noqa: BLE001
            ok = False
            log("! ЄДР: %s" % e)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
