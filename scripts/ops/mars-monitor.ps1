# Health monitor for the live Mars app. Run every 5 minutes by the scheduled task
# "MarsApp-Monitor" (via mars-monitor.vbs, so no console window flashes).
#
# Checks: local app, public address (through the Cloudflare tunnel), database,
# free disk space, and that the nightly backup (and its Drive copy) is fresh.
# A problem is announced after 2 failed runs in a row (about 10 minutes, so a
# restart or a deploy does not page anyone), repeated every 6 hours while it
# lasts, and a "recovered" message follows with how long it lasted.
# Once a day (first run after 09:00) it sends an "all OK" message: if that
# message stops arriving, the PC or its internet connection is down.
#
# Alerts go to ntfy.sh, a free push service that needs no account: the phone app
# subscribes to the secret topic stored in mars-ops\ntfy-topic.txt (never in git).
#
#   powershell -File mars-monitor.ps1            normal run
#   powershell -File mars-monitor.ps1 -Test      send one test notification and exit
param(
  [switch]$Test,
  [string]$StateFile = "C:\Users\MARS TST\mars-ops\monitor-state.json",
  [string]$LocalUrl = "http://localhost:3000/login",
  [string]$PublicUrl = "https://www.marsmeddenterp.site/login",
  [switch]$NoHeartbeat,
  [string]$TitlePrefix = ""
)

$ErrorActionPreference = "Continue"
$dir = "C:\Users\MARS TST\mars-ops"
$topicFile = Join-Path $dir "ntfy-topic.txt"
$logFile = Join-Path $dir "monitor.log"
$dbContainer = "supabase_db_mars-technical-support"
$backupDir = "C:\TaskApp\backups"
$driveDir = "C:\Users\MARS TST\Documents\TASKAPP-BACKUP"

$FailsBeforeAlert = 2
$RemindEveryHours = 6
$BackupMaxAgeHours = 30
$MinFreeGB = 5

function Log($m) {
  if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt 1MB)) { Move-Item -Force $logFile "$logFile.old" }
  Add-Content -Path $logFile -Value "$(Get-Date -Format s)  $m"
}

function Send-Alert($title, $body, $priority, $tags) {
  if (-not (Test-Path $topicFile)) { Log "no topic file - cannot send: $title"; return $false }
  $topic = (Get-Content $topicFile -Raw).Trim()
  try {
    Invoke-RestMethod -Uri "https://ntfy.sh/$topic" -Method Post -Body ([Text.Encoding]::UTF8.GetBytes($body)) `
      -Headers @{ Title = ($TitlePrefix + $title); Priority = $priority; Tags = $tags } -TimeoutSec 20 | Out-Null
    Log "sent: $title"
    return $true
  } catch {
    Log "send FAILED ($title): $($_.Exception.Message)"
    return $false
  }
}

if ($Test) {
  $ok = Send-Alert "Mars app: TEST" "This is a test message from the Mars app monitor on the office PC. If you can read this, alerts reach you." "default" "white_check_mark"
  if ($ok) { "Test notification sent." } else { "Test notification FAILED - see $logFile" }
  exit 0
}

function Get-Code($url) {
  try { return (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 20).StatusCode } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode } else { return 0 }
  }
}

function Newest-Age($path, $filter) {
  $f = Get-ChildItem $path -Filter $filter -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $f) { return $null }
  return ((Get-Date) - $f.LastWriteTime).TotalHours
}

# ---- run the checks: name -> $null when fine, or a short problem description ----
$problems = [ordered]@{}

$c = Get-Code $LocalUrl
$problems["App on this PC"] = $(if ($c -eq 200) { $null } else { "login page returned $c (0 = no answer)" })

$c = Get-Code $PublicUrl
$problems["Public website"] = $(if ($c -eq 200) { $null } else { "https://www.marsmeddenterp.site returned $c (0 = no answer; check the Cloudflare tunnel / internet)" })

$out = & docker exec $dbContainer pg_isready -U postgres 2>&1
$problems["Database"] = $(if ($LASTEXITCODE -eq 0) { $null } else { "Postgres not ready: $out" })

$drive = Get-PSDrive C
$freeGB = [math]::Round($drive.Free / 1GB, 1)
$problems["Disk space"] = $(if ($freeGB -ge $MinFreeGB) { $null } else { "only $freeGB GB free on C:" })

$age = Newest-Age $backupDir "mars-2*.sql"
$problems["Nightly backup"] = $(if ($null -ne $age -and $age -lt $BackupMaxAgeHours) { $null } else { "newest database backup is $(if ($null -eq $age) { 'missing' } else { ([math]::Round($age)).ToString() + ' hours old' })" })

$dage = Newest-Age $driveDir "mars-2*.sql"
$problems["Drive backup copy"] = $(if ($null -ne $dage -and $dage -lt $BackupMaxAgeHours) { $null } else { "newest copy in the Google Drive folder is $(if ($null -eq $dage) { 'missing' } else { [math]::Round($dage).ToString() + ' hours old' })" })

# ---- state ----
$state = @{}
if (Test-Path $StateFile) {
  try { (Get-Content $StateFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $state[$_.Name] = $_.Value } } catch { $state = @{} }
}
if (-not $state.ContainsKey("checks")) { $state["checks"] = $null }
$checks = @{}
if ($state["checks"]) { $state["checks"].PSObject.Properties | ForEach-Object { $checks[$_.Name] = $_.Value } }

$now = Get-Date
foreach ($name in $problems.Keys) {
  $p = $problems[$name]
  $s = $checks[$name]
  if (-not $s) { $s = [pscustomobject]@{ fails = 0; since = $null; alerted = $false; lastAlert = $null; pendingRecovery = $false } }

  if ($p) {
    Log "PROBLEM $name : $p"
    if ($s.fails -eq 0) { $s.since = $now.ToString("s") }
    $s.fails = [int]$s.fails + 1
    $due = (-not $s.alerted) -or ($s.lastAlert -and (($now - [datetime]$s.lastAlert).TotalHours -ge $RemindEveryHours))
    if ($s.fails -ge $FailsBeforeAlert -and $due) {
      $since = [datetime]$s.since
      $body = "$name`n$p`nSince $($since.ToString('dd.MM.yyyy HH:mm'))"
      if (Send-Alert "Mars app: $name is DOWN" $body "high" "rotating_light") { $s.alerted = $true; $s.lastAlert = $now.ToString("s") }
    }
  } else {
    if ($s.alerted -or $s.pendingRecovery) {
      $mins = if ($s.since) { [math]::Round(($now - [datetime]$s.since).TotalMinutes) } else { 0 }
      if (Send-Alert "Mars app: $name is OK again" "$name recovered after about $mins minutes." "default" "white_check_mark") {
        $s.pendingRecovery = $false
      } else { $s.pendingRecovery = $true }
    }
    $s.fails = 0; $s.since = $null; $s.alerted = $false; $s.lastAlert = $null
  }
  $checks[$name] = $s
}
$state["checks"] = [pscustomobject]$checks

# ---- daily "all OK" heartbeat (its absence means the PC or its internet is down) ----
if (-not $NoHeartbeat) {
  $today = $now.ToString("yyyy-MM-dd")
  $bad = @($problems.Keys | Where-Object { $problems[$_] })
  if ($now.Hour -ge 9 -and $state["lastHeartbeat"] -ne $today -and $bad.Count -eq 0) {
    $body = "All checks pass. App, public site and database are up. Free disk: $freeGB GB. Newest backup: $([math]::Round($age)) h old, Drive copy: $([math]::Round($dage)) h old."
    if (Send-Alert "Mars app: all OK" $body "min" "green_circle") { $state["lastHeartbeat"] = $today }
  }
}

$state | ConvertTo-Json -Depth 6 | Set-Content -Path $StateFile -Encoding UTF8
