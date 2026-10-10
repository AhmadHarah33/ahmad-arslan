# Keeping the live app running (Windows)

These are the files that keep the production app and its backups running on the office
PC. They used to live only in `C:\Users\MARS TST\mars-ops\`, outside the repo, so a
rebuilt machine would not have had them.

| File | What it does |
|---|---|
| `mars-watchdog.ps1` | Every 2 minutes: if nothing listens on port 3000, start the Next.js production server. Keeps its output in `server.log` / `server-err.log` (previous run kept as `*.old`) and writes the reason for each restart to `app.log`. Sets `PLAYWRIGHT_BROWSERS_PATH=C:\TaskApp\.playwright` so PDF export finds Chromium. |
| `mars-watchdog.vbs` | Launches the PowerShell script with no visible window (Task Scheduler would otherwise flash a console). |
| `MarsApp-Watchdog.task.xml` | Export of the Windows scheduled task that runs the `.vbs` at logon and every 2 minutes. |
| `MarsDbBackup.task.xml` | Export of the nightly 02:00 backup task (`scripts/backup.sh`). `scripts/register-backup-task.ps1` creates the same task. |

The scripts expect to be in `C:\Users\<user>\mars-ops\` and the app in `C:\TaskApp`.
The paths are written inside them; edit them if the new machine differs.

## Install on a new machine

```powershell
# 1. Put the scripts where the task expects them
New-Item -ItemType Directory -Force "$env:USERPROFILE\mars-ops"
Copy-Item scripts\ops\mars-watchdog.* "$env:USERPROFILE\mars-ops\"

# 2. Chromium for PDF export, kept inside the app folder
$env:PLAYWRIGHT_BROWSERS_PATH = "C:\TaskApp\.playwright"
npx playwright-core install chromium-headless-shell

# 3. Register the watchdog task (edit the task XML first: the user id inside is
#    the old machine's account, and the path in <Arguments> must match step 1)
Register-ScheduledTask -TaskName "MarsApp-Watchdog" -Xml (Get-Content scripts\ops\MarsApp-Watchdog.task.xml -Raw)

# 4. Register the nightly backup
powershell -File scripts\register-backup-task.ps1
```

Then `Start-ScheduledTask -TaskName MarsApp-Watchdog` and open `http://localhost:3000`.

## Rules learnt the hard way

- **Start the server through the scheduled task** (`Start-ScheduledTask -TaskName
  MarsApp-Watchdog`), never by hand from an app or tool that runs in a sandbox. Windows
  can redirect `AppData` for such processes, and the server then cannot find Chromium
  (PDF export fails with "Executable doesn't exist").
- **Deploy with `scripts\deploy.ps1`.** It restarts via the watchdog task and rolls back
  automatically if the new build does not come up.
- If you change `mars-watchdog.ps1` in `mars-ops`, copy it back here so the repo stays
  the source of truth (or edit here and copy it over).
