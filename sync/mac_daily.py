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
    # (data.gov.ua turns automated downloads away at times) when it is newer than the last reading.
    try:
        with open(os.path.join(DATA, "edr.json"), encoding="utf-8") as f:
            last = json.load(f).get("at") or ""
    except (OSError, ValueError):
        last = ""
    copies = sorted(glob.glob(os.path.expanduser("~/Downloads/uo*.zip")), key=os.path.getmtime)
    local = copies[-1] if copies and time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(os.path.getmtime(copies[-1]))) > last else None
    if codes:
        try:
            try:
                found = legal.scan_edr(codes, log)
            except Exception as e:  # noqa: BLE001
                if not local:
                    raise
                log("  ЄДР з сайту: %s — читаю завантажену копію %s" % (e, os.path.basename(local)))
                found = legal.scan_edr(codes, log, path=local)
            out = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "items": found,
                   "missing": sorted(codes - set(found))}
            with open(os.path.join(DATA, "edr.json"), "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        except Exception as e:  # noqa: BLE001
            ok = False
            log("! ЄДР: %s" % e)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
