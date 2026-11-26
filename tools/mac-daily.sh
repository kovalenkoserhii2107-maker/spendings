#!/bin/zsh
# The daily run on the team's Mac (sync/mac_daily.py): the CMU subvention orders and the state
# register, which the servers abroad cannot reach. It keeps a copy of the repository of its own
# (never the working folder), writes data/subvention.json and data/edr.json, commits and pushes
# them; the push starts the site's sync, which takes them in.
# Installed by tools/install-mac-daily.sh as a launchd agent (every morning, or on waking).
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
BASE="$HOME/Library/Application Support/SpendingMonitor"
REPO="$BASE/spendings"
LOGS="$HOME/Library/Logs/SpendingMonitor"
mkdir -p "$BASE" "$LOGS"
exec >>"$LOGS/daily.log" 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S')"

if [ ! -d "$REPO/.git" ]; then
  git clone --depth 30 https://github.com/kovalenkoserhii2107-maker/spendings.git "$REPO" || exit 1
fi
cd "$REPO" || exit 1
# This copy has no work of its own: it always starts from what is on GitHub.
git fetch --depth 30 origin main && git reset --hard origin/main || exit 1

/usr/bin/python3 -I sync/mac_daily.py

for f in data/subvention.json data/edr.json data/amcu.json; do [ -f "$f" ] && git add "$f"; done
if git diff --cached --quiet; then
  echo "Змін немає"
  exit 0
fi
git -c user.name="Spending monitor (Mac)" -c user.email="kovalenkoserhii2107-maker@users.noreply.github.com" \
  commit -q -m "Оновлення з Mac: ЄДР, АМКУ і субвенції"
for i in 1 2 3; do
  if git push -q origin HEAD:main; then echo "Надіслано"; exit 0; fi
  # GitHub's own run pushed meanwhile. It never writes these files while the Mac keeps them fresh;
  # should it ever, the Mac's copy wins (in a rebase "theirs" is the commit being replayed: ours here).
  git pull -q --rebase -X theirs origin main || { git rebase --abort; echo "! не вдалося злити"; exit 1; }
done
echo "! не вдалося надіслати"
exit 1
