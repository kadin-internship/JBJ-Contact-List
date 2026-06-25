#!/bin/bash
# Pulls the most recent successful Postgres backup produced by
# .github/workflows/backup-postgres.yml down into iCloud Drive, so the
# production database backup ends up alongside the local SQLite backups
# even though the dump itself is taken in GitHub Actions, not on this Mac.
# Run automatically by the LaunchAgent installed via
# scripts/install_postgres_backup_schedule.sh; safe to run by hand too.
# Requires `gh` to be installed and authenticated (`gh auth login`).
set -euo pipefail

REPO="kadin-internship/JBJ-Contact-List"
WORKFLOW="backup-postgres.yml"
ICLOUD_BACKUP_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/JBJContacts-Backups/postgres"
KEEP_DAYS=90
STAMP="$(date +%Y%m%d_%H%M%S)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$ICLOUD_BACKUP_DIR"

RUN_ID="$(gh run list --repo "$REPO" --workflow "$WORKFLOW" --status success --limit 1 --json databaseId --jq '.[0].databaseId')"

if [ -z "$RUN_ID" ]; then
  echo "$(date): no successful backup-postgres run found yet -- skipping" >&2
  exit 1
fi

gh run download "$RUN_ID" --repo "$REPO" --dir "$TMP_DIR"

DUMP_FILE="$(find "$TMP_DIR" -name "*.dump" | head -n1)"
if [ -z "$DUMP_FILE" ]; then
  echo "$(date): downloaded run $RUN_ID but no .dump file was in it" >&2
  exit 1
fi

cp "$DUMP_FILE" "$ICLOUD_BACKUP_DIR/postgres_$STAMP.dump"

# Prune backups older than KEEP_DAYS.
find "$ICLOUD_BACKUP_DIR" -name "postgres_*.dump" -mtime "+$KEEP_DAYS" -delete

echo "$(date): saved postgres backup from run $RUN_ID as postgres_$STAMP.dump"
