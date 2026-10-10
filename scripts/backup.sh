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

# Uploaded files (spare-part photos, field attachments, agreement contracts)
# live in a Docker volume, NOT in the database, so pg_dump does not contain
# them. A restore from the .sql alone would bring back rows pointing at
# missing files. Archive the storage volume alongside every dump.
STORAGE_CONTAINER="${SUPABASE_STORAGE_CONTAINER:-supabase_storage_mars-technical-support}"
STAMP="${FILE##*/mars-}"; STAMP="${STAMP%.sql}"
FILES_ARCHIVE="$DIR/mars-files-$STAMP.tar.gz"
if MSYS_NO_PATHCONV=1 docker exec "$STORAGE_CONTAINER" tar czf - -C /mnt stub > "$FILES_ARCHIVE" && [ -s "$FILES_ARCHIVE" ]; then
  echo "Files archived to $FILES_ARCHIVE"
else
  echo "Files backup FAILED (database dump is still fine)." >&2
  rm -f "$FILES_ARCHIVE"
fi

# Keep the 30 most recent dumps (and 30 file archives).
ls -1t "$DIR"/mars-2*.sql 2>/dev/null | tail -n +31 | xargs -r rm --
ls -1t "$DIR"/mars-files-*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm --

echo "Done. $(ls -1 "$DIR"/mars-2*.sql | wc -l) backups retained."

# Off-PC copy. Everything above lives on the same machine as the app, so a dead
# disk would take the backups with it. If backups/offsite-dir.txt exists, its
# first line is a folder (e.g. a Google Drive for desktop folder) that gets a
# copy of today's dump + files archive, keeping the newest 60 of each there.
OFFSITE_CFG="$DIR/offsite-dir.txt"
if [ -f "$OFFSITE_CFG" ]; then
  OFFSITE="$(head -n1 "$OFFSITE_CFG" | tr -d '')"
  if mkdir -p "$OFFSITE" 2>/dev/null && cp "$FILE" "$OFFSITE/"; then
    [ -s "$FILES_ARCHIVE" ] && cp "$FILES_ARCHIVE" "$OFFSITE/"
    ls -1t "$OFFSITE"/mars-2*.sql 2>/dev/null | tail -n +61 | xargs -r rm --
    ls -1t "$OFFSITE"/mars-files-*.tar.gz 2>/dev/null | tail -n +61 | xargs -r rm --
    echo "Off-PC copy OK: $OFFSITE"

    # The app's source code too (no data, no secrets): only files tracked by git
    # at the current commit, so node_modules, builds, backups and .env files are
    # left out. `latest/` is a plain readable folder; the .bundle holds the full
    # git history and restores with `git clone mars-code.bundle <folder>`.
    CODE_DIR="$OFFSITE/code"
    REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    if mkdir -p "$CODE_DIR/latest.new" \
       && git -C "$REPO_ROOT" archive HEAD | tar -x -C "$CODE_DIR/latest.new" \
       && git -C "$REPO_ROOT" bundle create "$CODE_DIR/mars-code.bundle" --all >/dev/null 2>&1; then
      rm -rf "$CODE_DIR/latest" && mv "$CODE_DIR/latest.new" "$CODE_DIR/latest"
      git -C "$REPO_ROOT" log -1 --format='%H %cd %s' > "$CODE_DIR/VERSION.txt"
      echo "Code copy OK: $CODE_DIR ($(git -C "$REPO_ROOT" log -1 --format=%h))"
    else
      rm -rf "$CODE_DIR/latest.new"
      echo "Code copy FAILED (data backup above is fine)." >&2
    fi
  else
    echo "OFF-PC COPY FAILED: cannot write to $OFFSITE (is Google Drive running and signed in?)" >&2
    exit 2
  fi
else
  echo "No off-PC copy configured (backups/offsite-dir.txt missing)." >&2
fi
