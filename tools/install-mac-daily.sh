#!/bin/zsh
# Installs (or reinstalls) the daily run on this Mac as a launchd agent: every day at 07:40, or as
# soon as the Mac wakes if it was asleep then. To remove it:
#   launchctl bootout gui/$(id -u)/ua.spendingmonitor.daily && rm ~/Library/LaunchAgents/ua.spendingmonitor.daily.plist
set -eu
BASE="$HOME/Library/Application Support/SpendingMonitor"
mkdir -p "$BASE" "$HOME/Library/Logs/SpendingMonitor" "$HOME/Library/LaunchAgents"
cp "$(dirname "$0")/mac-daily.sh" "$BASE/mac-daily.sh"
chmod +x "$BASE/mac-daily.sh"
PLIST="$HOME/Library/LaunchAgents/ua.spendingmonitor.daily.plist"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ua.spendingmonitor.daily</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$BASE/mac-daily.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>40</integer></dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/SpendingMonitor/launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/SpendingMonitor/launchd.log</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)/ua.spendingmonitor.daily" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Встановлено: щодня о 07:40 (або після пробудження). Журнал: ~/Library/Logs/SpendingMonitor/daily.log"
