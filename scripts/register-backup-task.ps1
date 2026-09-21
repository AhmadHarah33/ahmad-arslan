# Registers a daily Windows Scheduled Task that runs scripts/backup.sh via
# Git Bash. Run this once, e.g. from an elevated PowerShell:
#   powershell -File scripts\register-backup-task.ps1
#
# Check it ran: Get-ScheduledTaskInfo -TaskName MarsDbBackup
# Run it by hand: Start-ScheduledTask -TaskName MarsDbBackup
# Remove it: Unregister-ScheduledTask -TaskName MarsDbBackup

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$bash = "C:\Program Files\Git\bin\bash.exe"
if (-not (Test-Path $bash)) {
    throw "Git Bash not found at $bash - adjust the path in this script."
}

$logDir = Join-Path $repoRoot "backups"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "backup.log"

$bashArg = '-lc "cd ''' + $repoRoot + '''; ./scripts/backup.sh >> backups/backup.log 2>&1"'

$action = New-ScheduledTaskAction -Execute $bash -Argument $bashArg
$trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName "MarsDbBackup" -Action $action -Trigger $trigger -Settings $settings -Description "Daily pg_dump of the Mars Technical Support Supabase database (see scripts/backup.sh)." -Force

Write-Host "Registered. Log file: $logFile"
Write-Host "Running it now to confirm it works..."
Start-ScheduledTask -TaskName "MarsDbBackup"
Start-Sleep -Seconds 5
Get-ScheduledTaskInfo -TaskName "MarsDbBackup" | Format-List TaskName, LastRunTime, LastTaskResult, NextRunTime
