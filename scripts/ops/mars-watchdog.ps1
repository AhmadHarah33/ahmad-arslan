# Keeps the Mars Support app alive on port 3000.
# Runs at logon and every 2 minutes: starts the Next.js server only when
# nothing is already listening, so repeated runs are harmless.
$ErrorActionPreference = "SilentlyContinue"

$listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listening) { exit 0 }

$log = "C:\Users\MARS TST\mars-ops\app.log"
Add-Content -Path $log -Value "$(Get-Date -Format s)  port 3000 down - starting app"

# Keep the server's output so a crash leaves a reason behind (this log used to
# only say "port 3000 down"). The previous run's output is kept as *.old and
# its last lines are copied into app.log.
$serverLog = "C:\Users\MARS TST\mars-ops\server.log"
$serverErr = "C:\Users\MARS TST\mars-ops\server-err.log"
if (Test-Path $serverErr) {
  $tail = (Get-Content $serverErr -Tail 6) -join " | "
  if ($tail) { Add-Content -Path $log -Value "$(Get-Date -Format s)  last server errors before restart: $tail" }
}
foreach ($f in @($serverLog, $serverErr)) { if (Test-Path $f) { Move-Item -Force $f "$f.old" } }

# PDF export needs Chromium. Use the copy kept inside the app folder so it does
# not depend on the per-user AppData location (which differs between how the
# app is started).
$env:PLAYWRIGHT_BROWSERS_PATH = "C:\TaskApp\.playwright"

Start-Process -FilePath "C:\Program Files\nodejs\node.exe" `
  -ArgumentList '"C:\TaskApp\node_modules\next\dist\bin\next"', 'start' `
  -WorkingDirectory "C:\TaskApp" -WindowStyle Hidden `
  -RedirectStandardOutput $serverLog -RedirectStandardError $serverErr
