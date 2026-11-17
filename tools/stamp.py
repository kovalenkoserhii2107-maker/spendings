"""Stamps the version and build id into the site before it is published.

Run by GitHub Actions right before the Pages upload (the stamped files are not
committed). The build id is the version plus a hash of the site's own code, so it
changes only when the code changes: data-only runs every 6 hours keep the same
build and do not make browsers offer an "update".

    python3 tools/stamp.py           # stamps index.html, app.js, sw.js in place
    python3 tools/stamp.py --print   # just shows the build id
"""
import hashlib
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
# Everything the browser loads apart from data/.
SOURCES = ["VERSION", "index.html", "style.css", "firebase-config.js", "i18n.js", "app.js", "cloud.js", "registry.js", "sw.js",
           "manifest.webmanifest", "icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png",
           "icons/apple-touch-icon.png"]
STAMPED = ["index.html", "app.js", "sw.js"]


def read(name, mode="r"):
    with open(os.path.join(ROOT, name), mode, **({} if "b" in mode else {"encoding": "utf-8"})) as f:
        return f.read()


def build_id():
    version = read("VERSION").strip()
    h = hashlib.sha256()
    for name in SOURCES:
        h.update(name.encode() + b"\0" + read(name, "rb") + b"\0")
    return version, "%s-%s" % (version, h.hexdigest()[:8])


def main():
    version, build = build_id()
    if "--print" in sys.argv:
        print(build)
        return
    for name in STAMPED:
        text = read(name)
        if "__BUILD__" not in text and "__VERSION__" not in text:
            sys.exit("%s is already stamped" % name)
        with open(os.path.join(ROOT, name), "w", encoding="utf-8") as f:
            f.write(text.replace("__VERSION__", version).replace("__BUILD__", build))
    print("stamped", build)


if __name__ == "__main__":
    main()
