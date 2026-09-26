<#
.SYNOPSIS
    Schedules run_daily.py (collect + score jobs) every day with Windows Task Scheduler.

.DESCRIPTION
    - Runs as you, only while you're logged in (no password or admin rights needed).
    - Uses pythonw.exe, so no console window pops up. Output goes to backend\logs\run_daily.log.
    - "Start when available": if the PC was off or asleep at the scheduled time,
      the task runs as soon as possible afterwards.
    - Waits for a network connection and is stopped if it runs longer than 2 hours.
    Running this again replaces the existing task (e.g. to change the time).

.PARAMETER Time
    Time of day in 24h format. Default 09:00.

.PARAMETER TaskName
    Name shown in Task Scheduler. Default JobTracker-Daily.

.PARAMETER RunArgs
    Extra arguments for run_daily.py, e.g. '--quick' or '--skip-match'.

.PARAMETER BackendDir
    Path to the backend folder. Default: ..\backend next to this script.

.EXAMPLE
    .\scripts\register-daily-task.ps1
    .\scripts\register-daily-task.ps1 -Time 08:30
#>
param(
    [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
    [string]$Time = '09:00',
    [string]$TaskName = 'JobTracker-Daily',
    [string]$RunArgs = '',
    [string]$BackendDir = (Join-Path (Split-Path $PSScriptRoot -Parent) 'backend')
)

$ErrorActionPreference = 'Stop'

$BackendDir = (Resolve-Path $BackendDir).Path
$pythonw = Join-Path $BackendDir '.venv\Scripts\pythonw.exe'
if (-not (Test-Path $pythonw)) {
    Write-Host "Not found: $pythonw. Run .\setup.ps1 first." -ForegroundColor Red
    exit 1
}

$arguments = ('run_daily.py ' + $RunArgs).Trim()

$action = New-ScheduledTaskAction -Execute $pythonw -Argument $arguments -WorkingDirectory $BackendDir
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Description 'Job Tracker: collect new jobs and score them with Gemini. Never applies to jobs.' `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

$next = (Get-ScheduledTaskInfo -TaskName $TaskName).NextRunTime
Write-Host "Scheduled '$TaskName' daily at $Time." -ForegroundColor Green
Write-Host "  Runs:     $pythonw $arguments"
Write-Host "  In:       $BackendDir"
Write-Host "  Next run: $next"
Write-Host "  Log file: $(Join-Path $BackendDir 'logs\run_daily.log')"
Write-Host ''
Write-Host "Run it now to test:   Start-ScheduledTask -TaskName $TaskName"
Write-Host "Check the result:     Get-ScheduledTaskInfo -TaskName $TaskName   (LastTaskResult 0 = success)"
Write-Host 'Remove it:            .\scripts\unregister-daily-task.ps1'
