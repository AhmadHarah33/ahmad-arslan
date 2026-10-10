# Safe deploy of the live app (production build on port 3000).
#
#   powershell -File scripts\deploy.ps1
#
# What it does, in order:
#   1. Refuses to run if the typecheck fails.
#   2. Tags the current commit as a return point (pre-deploy-<timestamp>) and
#      copies the current build to .next-backup.
#   3. Builds. If the build fails, the old build is put back and the live app is
#      left exactly as it was.
#   4. Restarts the server and checks /login answers 200. If it does not, the old
#      build is restored and restarted automatically.
#
# Manual rollback after a deploy that "worked" but turned out bad:
#   Stop the server on port 3000, delete .next, rename .next-backup to .next,
#   start it again (the watchdog does this within 2 minutes), or:
#   git revert <commit>; then run this script again.

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repo

$node = "C:\Program Files\nodejs\node.exe"
$next = Join-Path $repo "node_modules\next\dist\bin\next"
$serverLog = "C:\Users\MARS TST\mars-ops\server.log"

function Stop-Live {
  Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

function Start-Live {
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList '/c', "`"$node`" `"$next`" start >> `"$serverLog`" 2>&1" `
    -WorkingDirectory $repo -WindowStyle Hidden
}

function Test-Live {
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    try {
      $r = Invoke-WebRequest "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 10
      if ($r.StatusCode -eq 200) { return $true }
    } catch { }
  }
  return $false
}

function Restore-Backup {
  Write-Host "Restoring the previous build..." -ForegroundColor Yellow
  Stop-Live
  if (Test-Path ".next") { Remove-Item -Recurse -Force ".next" }
  Copy-Item -Recurse ".next-backup" ".next"
  Start-Live
  if (Test-Live) { Write-Host "Previous version is running again." -ForegroundColor Yellow }
  else { Write-Host "Could not confirm the previous version is up - check port 3000 / the watchdog." -ForegroundColor Red }
}

Write-Host "1/4 Typechecking..."
& npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed - nothing was changed." }

$stamp = Get-Date -Format "yyyyMMdd-HHmm"
Write-Host "2/4 Saving a return point (pre-deploy-$stamp) and the current build..."
git tag "pre-deploy-$stamp"
if (Test-Path ".next-backup") { Remove-Item -Recurse -Force ".next-backup" }
if (Test-Path ".next") { Copy-Item -Recurse ".next" ".next-backup" }

Write-Host "3/4 Building (the live app keeps serving until this finishes)..."
& npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed." -ForegroundColor Red
  if (Test-Path ".next-backup") {
    if (Test-Path ".next") { Remove-Item -Recurse -Force ".next" }
    Copy-Item -Recurse ".next-backup" ".next"
  }
  throw "Build failed - the live app was not restarted and is unchanged."
}

Write-Host "4/4 Restarting and checking the app..."
Stop-Live
Start-Live
if (Test-Live) {
  Write-Host "Deployed OK. Return point: git tag pre-deploy-$stamp, old build in .next-backup." -ForegroundColor Green
} else {
  Write-Host "New build did not come up healthy." -ForegroundColor Red
  Restore-Backup
  throw "Deploy rolled back."
}
