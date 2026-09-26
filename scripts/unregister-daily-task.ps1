<#
.SYNOPSIS
    Removes the daily Job Tracker task from Windows Task Scheduler.

.EXAMPLE
    .\scripts\unregister-daily-task.ps1
#>
param(
    [string]$TaskName = 'JobTracker-Daily'
)

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
} else {
    Write-Host "No scheduled task named '$TaskName' found."
}
