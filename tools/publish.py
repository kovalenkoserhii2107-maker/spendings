"""Publishes the site code to GitHub as one commit and tags the version.

The token is read from ~/.config/spendings/github-token (a fine-grained token with
"Contents: read and write" on the repository only). It is never printed. data/ is
left alone: GitHub Actions owns it.

    python3 tools/publish.py --dry-run          # show what would change
    python3 tools/publish.py -m "what changed"  # commit to main and tag v<VERSION>

Pushing to main starts the workflow, which refreshes data, stamps the build and
deploys GitHub Pages.
"""
import argparse
import base64
import hashlib
import json
import os
import ssl
import sys
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
REPO = "kovalenkoserhii2107-maker/spendings"
TOKEN_FILE = os.path.expanduser("~/.config/spendings/github-token")
SKIP_DIRS = {".git", "data", "__pycache__", "node_modules"}
SKIP_FILES = {".DS_Store"}
API = "https://api.github.com"


def ssl_context():
    # python.org builds on macOS ship without CA certificates; use the system bundle.
    for cafile in ("/etc/ssl/cert.pem", None):
        try:
            return ssl.create_default_context(cafile=cafile)
        except Exception:
            continue
    return ssl.create_default_context()


CTX = ssl_context()


def token():
    try:
        with open(TOKEN_FILE, encoding="utf-8") as f:
            value = f.read().strip()
    except FileNotFoundError:
        sys.exit("No token: save a GitHub fine-grained token to %s" % TOKEN_FILE)
    if not value:
        sys.exit("The token file is empty")
    return value


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={
        "Authorization": "Bearer " + TOKEN,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "spendings-publish",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=60) as res:
            return json.loads(res.read() or b"null")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise SystemExit("GitHub %s %s -> %s %s" % (method, path, e.code, detail))


def local_files():
    out = {}
    for base, dirs, files in os.walk(ROOT):
        rel_base = os.path.relpath(base, ROOT)
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not (rel_base == "." and d.startswith(".") and d != ".github")]
        for name in files:
            if name in SKIP_FILES or name.endswith(".pyc"):
                continue
            path = os.path.join(base, name)
            rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
            with open(path, "rb") as f:
                out[rel] = f.read()
    return out


def blob_sha(data):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def main():
    global TOKEN
    ap = argparse.ArgumentParser()
    ap.add_argument("-m", "--message", default="")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-tag", action="store_true")
    args = ap.parse_args()

    TOKEN = token()
    with open(os.path.join(ROOT, "VERSION"), encoding="utf-8") as f:
        version = f.read().strip()

    head = call("GET", "/repos/%s/git/ref/heads/main" % REPO)["object"]["sha"]
    base_tree = call("GET", "/repos/%s/git/commits/%s" % (REPO, head))["tree"]["sha"]
    remote = {e["path"]: e["sha"] for e in call("GET", "/repos/%s/git/trees/%s?recursive=1" % (REPO, base_tree))["tree"] if e["type"] == "blob"}

    files = local_files()
    changed = sorted(p for p, data in files.items() if remote.get(p) != blob_sha(data))
    for p in changed:
        print(("new      " if p not in remote else "changed  ") + p)
    if not changed:
        print("Nothing to publish.")
        return
    if args.dry_run:
        return

    tree = []
    for p in changed:
        blob = call("POST", "/repos/%s/git/blobs" % REPO, {"content": base64.b64encode(files[p]).decode(), "encoding": "base64"})
        tree.append({"path": p, "mode": "100755" if os.access(os.path.join(ROOT, p), os.X_OK) and p.endswith((".py", ".sh")) else "100644", "type": "blob", "sha": blob["sha"]})
    new_tree = call("POST", "/repos/%s/git/trees" % REPO, {"base_tree": base_tree, "tree": tree})["sha"]
    message = "v%s%s" % (version, (": " + args.message) if args.message else "")
    commit = call("POST", "/repos/%s/git/commits" % REPO, {"message": message, "tree": new_tree, "parents": [head]})["sha"]
    call("PATCH", "/repos/%s/git/refs/heads/main" % REPO, {"sha": commit})
    print("Committed %s (%d files): %s" % (commit[:7], len(changed), message))

    if not args.no_tag:
        tag = "refs/tags/v" + version
        try:
            call("POST", "/repos/%s/git/refs" % REPO, {"ref": tag, "sha": commit})
            print("Tagged v" + version)
        except SystemExit:
            # The version was tagged by an earlier publish; move it to this commit.
            call("PATCH", "/repos/%s/git/%s" % (REPO, tag), {"sha": commit, "force": True})
            print("Moved tag v" + version)


if __name__ == "__main__":
    main()
