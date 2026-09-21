#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Database backup for the self-hosted Supabase (Docker) Postgres.
# Creates a timestamped SQL dump in ./backups. Runs pg_dump *inside* the
# Postgres container via `docker exec` rather than requiring the postgres
# client tools on the host — the host doesn't have psql/pg_dump installed,
# only the container does, and that's the one guaranteed to always match the
# server's version.
#
# Scheduled via Windows Task Scheduler (task "MarsDbBackup"), daily at 02:00 —
# see scripts/register-backup-task.ps1. To do the same on Linux/macOS, cron
# works just as well:
#   0 2 * * *  /path/to/mars/scripts/backup.sh >> /path/to/mars/backups/backup.log 2>&1
#
# Restore with:
#   docker exec -i <container> psql -U postgres -d postgres < backups/mars-YYYYmmdd-HHMMSS.sql
# (restoring into a database that already has data will conflict on primary
# keys — restore into a freshly reset/empty database.)
# ---------------------------------------------------------------------------
set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_mars-technical-support}"

DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
mkdir -p "$DIR"
FILE="$DIR/mars-$(date +%Y%m%d-%H%M%S).sql"

echo "Backing up $CONTAINER to $FILE"
docker exec "$CONTAINER" pg_dump -U postgres --no-owner --no-privileges postgres > "$FILE"

# A failed dump still creates an empty/partial file above (pg_dump's own
# error goes to stderr, not into $FILE) — catch that before it silently
# evicts a good backup below.
if [ ! -s "$FILE" ]; then
  echo "Backup failed: $FILE is empty. Removing it." >&2
  rm -f "$FILE"
  exit 1
fi

# Keep the 30 most recent dumps.
ls -1t "$DIR"/mars-*.sql 2>/dev/null | tail -n +31 | xargs -r rm --

echo "Done. $(ls -1 "$DIR"/mars-*.sql | wc -l) backups retained."
