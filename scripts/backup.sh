#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Database backup for the self-hosted Supabase (Docker) Postgres.
# Creates a timestamped SQL dump in ./backups. Schedule it with cron for
# automated backups, e.g. daily at 02:00:
#   0 2 * * *  /path/to/mars/scripts/backup.sh >> /path/to/mars/backups/backup.log 2>&1
#
# Restore with:
#   psql "$DB_URL" < backups/mars-YYYYmmdd-HHMMSS.sql
# ---------------------------------------------------------------------------
set -euo pipefail

# Local Supabase Postgres (default port 54322). Override DB_URL if different.
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
mkdir -p "$DIR"
FILE="$DIR/mars-$(date +%Y%m%d-%H%M%S).sql"

echo "Backing up to $FILE"
pg_dump "$DB_URL" --no-owner --no-privileges > "$FILE"

# Keep the 30 most recent dumps.
ls -1t "$DIR"/mars-*.sql 2>/dev/null | tail -n +31 | xargs -r rm --

echo "Done. $(ls -1 "$DIR"/mars-*.sql | wc -l) backups retained."
