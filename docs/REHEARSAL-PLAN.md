# Disaster-recovery rehearsal plan

Goal: prove that, starting from **nothing but what is in the Google Drive backup
folder plus the password manager**, we can bring the app back on a different
computer, with all data and files, and know how long it takes.

This is the one thing in `docs/RESTORE.md` (section C) that has never been run. Today
we only know the backup files are complete (database and file checksums matched in
the 2026-10-10 trial). We do not yet know the rebuild works.

## What we are really testing (the unknowns)

1. **Drive copy is usable.** Everything is taken from the Drive folder, not from the
   office PC. If a file is missing or half-synced, we find out now.
2. **Loading the dump into a fresh Supabase.** The dump was made with
   `--no-privileges`, so the roles `anon`, `authenticated`, `service_role` probably
   need their access to the `public` schema granted again. Unconfirmed.
3. **Putting the uploaded files back** into the storage container so photos and
   attachments open.
4. **Logins survive.** Accounts live in the database (`auth` schema), so the same
   passwords should work. Unconfirmed on a fresh stack.
5. **Missing pieces.** Anything that exists only on the office PC and that nobody
   wrote down (tunnel setup, Windows tasks, env values, Chromium for PDFs).
6. **Time.** How many hours from "PC is dead" to "team can work".

## What you need

- A **spare Windows PC or laptop** with about 20 GB free and internet. A virtual
  machine or Windows Sandbox is fine if no spare PC exists, but a real machine tells
  us more (Docker, firewalls, power settings).
- Access to the company Google Drive and the password manager (with the `.env.local`
  values). Do **not** copy anything from the office PC: that is the point.
- About **3 hours** and about 1 hour of someone else watching, to follow the written
  steps without guessing.
- A decision on data: the rehearsal loads **real customer data** onto the spare
  machine. Use a machine you trust and wipe it afterwards (last section).

## Before the day (15 minutes, on the office PC)

- Run `bash scripts/backup.sh` so there is a fresh matching pair of files.
- On drive.google.com check the newest `mars-…sql`, `mars-files-….tar.gz`, and the
  `code` folder are there and the sizes match the files in `C:\TaskApp\backups`.
- Write down, from the office PC, the versions in use (the rebuild should match):
  Node 24.x, Docker Desktop, and the Supabase CLI (the stack was created by CLI
  `2.120.0`; the CLI is not installed globally on the office PC, run it with
  `npx supabase@2.120.0` if needed).
- Open a file `rehearsal-notes.txt` to log every command that was needed and every
  surprise, with times. This log becomes the corrected `RESTORE.md`.

## The rehearsal (on the spare machine)

Start the clock. Only use the Drive folder and the password manager.

| # | Step | Done when |
|---|---|---|
| 1 | Install Git, Node (same major version as the office PC), Docker Desktop. Start Docker. | `node -v`, `docker ps` work |
| 2 | Download the `TASKAPP-BACKUP` folder from Drive (web download, not the office PC). | newest `.sql`, `.tar.gz`, and `code/` present, sizes match |
| 3 | Get the code: `git clone code\mars-code.bundle C:\TaskApp` (then also try cloning GitHub, to confirm both routes work). | `C:\TaskApp` has `package.json` |
| 4 | Create `C:\TaskApp\.env.local` from the password manager. `npm install`. | install finishes; no missing-env errors at build |
| 5 | Start a fresh database: `npx supabase@2.120.0 start`. | all containers running; login page of Studio opens |
| 6 | Load the newest `.sql` into an **empty** database. Try first into a new spare database (as in `RESTORE.md` A) to see the errors; then decide how to make it the real one (see "Decision to make" below). | row counts match the numbers recorded on the office PC |
| 7 | Re-grant access on the `public` schema to `anon`, `authenticated`, `service_role` if the app shows permission errors. | app pages load data (no "permission denied") |
| 8 | Restore files: `docker exec -i supabase_storage_mars-technical-support tar xzf - -C /mnt < mars-files-….tar.gz`. | a spare-part photo and a task attachment open in the app |
| 9 | `npm run build`, `npm start`. Install Chromium for PDFs and point `PLAYWRIGHT_BROWSERS_PATH` at it. | app opens on `localhost:3000` |
| 10 | Run the acceptance checklist below. | every box ticked |

Stop the clock. Record total time and the time of each step.

### Decision to make during step 6

The new Supabase starts with its own empty `postgres` database that already has
tables from the migrations. Loading the dump on top fails on duplicates. Try, in this
order, and record which works first time:

- **Option 1 (preferred):** stop the app, drop and recreate the `public` schema, load
  the dump (it also contains `auth` and `storage` data, so their rows are loaded
  too), then re-grant privileges.
- **Option 2:** `supabase db reset` to a clean state and load only the **data** parts
  of the dump (`pg_restore`/`--data-only` style). Needs a data-only dump; if this is
  the better route, change `scripts/backup.sh` to also produce one.

Whichever works becomes the official step in `RESTORE.md`.

## Acceptance checklist (the rebuild counts as successful only if all pass)

- [ ] Log in with a real account and password (head account and one engineer).
- [ ] Customers page shows the same number of customers as the office PC (79 on
      2026-10-10, adjust to the number recorded).
- [ ] Tasks page shows the same tasks; open one with a TEŞHİS/ÇÖZÜM and attachments.
- [ ] A spare-part photo and a customer/task attachment open.
- [ ] Service page: agreements and visits match; calendar renders.
- [ ] **Download report** (task PDF) and **History file (PDF)** both generate.
- [ ] Create a test task, move it to Done, delete it; nothing errors.
- [ ] Admin audit log shows old entries (history preserved).
- [ ] `docker exec ... psql ... select count(*)` on the main tables equals the office
      PC's numbers (record them on the day of the backup).

## After the rehearsal

1. Turn the notes into the final version of `RESTORE.md` section C: exact commands,
   the working option from step 6, the grants that were needed, and real timings.
2. Fix anything that was missing from the backups (for example a config or setup
   step that only existed on the office PC) in `scripts/backup.sh` or the docs.
3. Update `RESTORE.md` to remove the "not rehearsed" warning and add the date and the
   time it took.
4. **Wipe the spare machine's copy of the data:** `docker compose`/Supabase stop and
   remove volumes (`npx supabase@2.120.0 stop --no-backup`), delete `C:\TaskApp`, the
   downloaded Drive folder, and `.env.local`. If it was a VM, delete the VM.
5. Repeat the rehearsal (shorter) every 6 months, or after a major change to the
   setup, and put the date in `RESTORE.md`.

## Not covered by this rehearsal (separate small jobs)

- Re-creating the Cloudflare Tunnel and DNS for the new machine (needs your Cloudflare
  login; do it for real only in an actual disaster, but write the exact steps down).
- The Windows tasks (`MarsApp-Watchdog`, `MarsDbBackup`) on the new machine:
  `scripts/register-backup-task.ps1` exists for the backup; the watchdog scripts live
  in `C:\Users\MARS TST\mars-ops` and are **not in the repo or the code backup**.
  Recommended first fix: copy them into the repo (`scripts/ops/`) so they travel with
  the code.
