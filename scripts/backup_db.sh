#!/bin/bash
# Daily backup of contacts.db -- one copy stays local, one syncs off this
# machine via iCloud Drive, since the live database isn't in git (it
# holds real contact PII). Run automatically by the LaunchAgent installed
# via scripts/install_backup_schedule.sh; safe to run by hand too.
set -euo pipefail

PROJECT_DIR="/Users/kadinlee-smith/JBJContacts"
DB_FILE="$PROJECT_DIR/contacts.db"
LOCAL_BACKUP_DIR="$PROJECT_DIR/backups"
ICLOUD_BACKUP_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/JBJContacts-Backups"
KEEP_DAYS=60
STAMP="$(date +%Y%m%d_%H%M%S)"

if [ ! -f "$DB_FILE" ]; then
  echo "$(date): contacts.db not found at $DB_FILE -- skipping backup" >&2
  exit 1
fi

mkdir -p "$LOCAL_BACKUP_DIR" "$ICLOUD_BACKUP_DIR"

cp "$DB_FILE" "$LOCAL_BACKUP_DIR/contacts_$STAMP.db"
cp "$DB_FILE" "$ICLOUD_BACKUP_DIR/contacts_$STAMP.db"

# Prune backups older than KEEP_DAYS in both locations.
find "$LOCAL_BACKUP_DIR" -name "contacts_*.db" -mtime "+$KEEP_DAYS" -delete
find "$ICLOUD_BACKUP_DIR" -name "contacts_*.db" -mtime "+$KEEP_DAYS" -delete

echo "$(date): backed up contacts.db as contacts_$STAMP.db (local + iCloud)"
