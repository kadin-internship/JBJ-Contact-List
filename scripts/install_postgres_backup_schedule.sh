#!/bin/bash
# One-time setup: installs the LaunchAgent that runs
# scripts/fetch_postgres_backup.sh daily at 9am, pulling the latest
# GitHub Actions Postgres backup into iCloud Drive. Safe to re-run.
set -euo pipefail

PLIST_PATH="$HOME/Library/LaunchAgents/com.jbjcontacts.pgbackup.plist"
PROJECT_DIR="/Users/kadinlee-smith/JBJContacts"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.jbjcontacts.pgbackup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$PROJECT_DIR/scripts/fetch_postgres_backup.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$PROJECT_DIR/backups/pgbackup.log</string>
  <key>StandardErrorPath</key>
  <string>$PROJECT_DIR/backups/pgbackup.log</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST

mkdir -p "$PROJECT_DIR/backups"
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load -w "$PLIST_PATH"
echo "Installed and loaded com.jbjcontacts.pgbackup (runs daily at 9:00am)."
echo "Check it's registered: launchctl list | grep jbjcontacts"
