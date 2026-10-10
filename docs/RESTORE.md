# Backups and restore

Written 2026-10-10 after a real trial restore (see "What has been tested").

## What is backed up, and where

Every night at 02:00 the Windows task **MarsDbBackup** runs `scripts/backup.sh`.
Each run produces:

| File | What it holds |
|---|---|
| `mars-YYYYMMDD-HHMMSS.sql` | The whole database: customers, tasks, agreements, settings, user accounts (logins), audit log. |
| `mars-files-YYYYMMDD-HHMMSS.tar.gz` | Uploaded files: spare-part photos, field attachments, agreement contracts. These live in a Docker volume, **not** in the database, so the `.sql` alone does not contain them. |
| `code/latest/` and `code/mars-code.bundle` | The app's source code (no data, no secrets). |

Copies:

1. **On the office PC:** `C:\TaskApp\backups\` (newest 30 kept).
2. **Off the PC:** `C:\Users\MARS TST\Documents\TASKAPP-BACKUP\` which Google Drive
   syncs (newest 60 kept). Which folder is used is set in
   `C:\TaskApp\backups\offsite-dir.txt`.
3. **Code:** also on GitHub (`AhmadHarah33/ahmad-arslan`).

**Not in any backup:** `C:\TaskApp\.env.local` (the app's keys and URLs). Keep its
contents in a password manager. You cannot rebuild the app without it.

Check it is running: `Get-ScheduledTaskInfo -TaskName MarsDbBackup` (LastTaskResult
should be 0), and look at the newest file in `backups\` and in the Drive folder.
If the Drive copy fails the script logs `OFF-PC COPY FAILED` in
`backups\backup.log` and exits with code 2.

To back up right now: `bash scripts/backup.sh` from `C:\TaskApp`.

## Rule 1: never restore over the live database

A restore into a database that already has data fails on duplicate keys and can
leave a mix of old and new. Always restore into an **empty** database. Practise on
a spare one first (below) so you are not learning during an emergency.

## A. Check a backup is good (safe, no effect on the live app)

This is what was run on 2026-10-10. Replace the file name with the backup to check.

```bash
# 1. Make an empty spare database next to the live one
docker exec supabase_db_mars-technical-support psql -U postgres -c "create database restore_test"

# 2. Load the dump into it
docker exec -i supabase_db_mars-technical-support psql -U postgres -d restore_test -q < backups/mars-YYYYMMDD-HHMMSS.sql

# 3. Look at it (counts should match the live app)
docker exec supabase_db_mars-technical-support psql -U postgres -d restore_test -c "select count(*) from public.tasks"

# 4. Throw it away
docker exec supabase_db_mars-technical-support psql -U postgres -c "drop database restore_test"
```

Expect exactly two harmless errors: `permission denied to set parameter
"log_min_messages"` and `permission denied for table secrets` (Supabase's vault, not
used by this app).

To check the files archive, extract it somewhere temporary and compare:

```bash
mkdir /tmp/files-check && tar xzf backups/mars-files-YYYYMMDD-HHMMSS.tar.gz -C /tmp/files-check
# ... look inside /tmp/files-check/stub, then delete the folder
```

## B. Get one lost file back

Uploaded files are in the files archive under `stub/<bucket>/<id>/...`
(`spare-part-photos`, `field-files`, `agreement-contracts`). Extract the archive to a
temporary folder (command above), find the file, and upload it again through the app.
Do not extract over the live storage volume.

## C. The PC is gone: rebuild on a new machine

**This path has not been rehearsed end to end.** The pieces in A were tested; the
steps below are the intended plan. Do the rehearsal in `docs/REHEARSAL-PLAN.md` on a spare machine before you ever
depend on it, and expect to adjust.

1. Install Git, Node (same major version as the office PC, currently 24.x), Docker Desktop and the Supabase CLI (the stack was created with `npx supabase@2.120.0`).
2. Get the code: clone GitHub, or use `code/latest/` from the Drive folder, or
   `git clone mars-code.bundle C:\TaskApp`.
3. Put `.env.local` back (from the password manager) and run `npm install`.
4. Start a fresh database: `supabase start` (applies the migrations and seed).
5. Load the data from the newest `.sql` **into an empty database**, not on top of the
   seeded one. The dump was made with `--no-privileges`, so after loading, the Supabase
   roles (`anon`, `authenticated`, `service_role`) need their access to the `public`
   schema granted again. This is the least certain step and the one to rehearse.
6. Put the uploaded files back from the newest `mars-files-*.tar.gz` into the storage
   container's `/mnt` (the archive's top folder is `stub`).
7. `npm run build`. Install the watchdog and backup tasks from `scripts/ops/` (see its README), which also starts the app. Then check
   login, a customer, a task, a photo, and **Download report**.
8. Re-point the Cloudflare Tunnel at the new machine.

## Things that matter

- Uploaded files and the database are separate. Always keep the matching pair (same
  timestamp).
- Backups contain real customer data and user accounts. Keep the Drive folder private.
- The history of changes lives in the audit log, which is inside the database backup.
