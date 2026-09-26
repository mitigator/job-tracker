<#
.SYNOPSIS
    Starts the backend API and the frontend dashboard together, then opens the browser.
    Press Ctrl+C to stop both.

.PARAMETER NoBrowser
    Don't open the dashboard in the browser.

.PARAMETER Reload
    Start the API with auto-reload on code changes (for development).

.EXAMPLE
    .\start.ps1
    .\start.ps1 -NoBrowser
#>
param(
    [switch]$NoBrowser,
    [switch]$Reload
)

$ErrorActionPreference = 'Continue'

$root     = $PSScriptRoot
$backend  = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$venvPy   = Join-Path $backend '.venv\Scripts\python.exe'

# Keep in sync with backend\config.yaml (api.port) and frontend\vite.config.ts.
$apiUrl       = 'http://127.0.0.1:8000'
$dashboardUrl = 'http://localhost:5173'

# ---------------------------------------------------------------- checks
if (-not (Test-Path $venvPy)) {
    Write-Host 'backend\.venv not found. Run .\setup.ps1 first.' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host 'frontend\node_modules not found. Run .\setup.ps1 first.' -ForegroundColor Red
    exit 1
}

function Test-PortInUse([int]$port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}
foreach ($port in 8000, 5173) {
    if (Test-PortInUse $port) {
        Write-Host "Port $port is already in use. Is Job Tracker already running in another window?" -ForegroundColor Red
        exit 1
    }
}

function Wait-ForUrl([string]$url, [int]$timeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return $true
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    return $false
}

# Kills a process and everything it started (uvicorn workers, node, etc.).
function Stop-Tree($process) {
    if ($process -and -not $process.HasExited) {
        & taskkill /PID $process.Id /T /F 2>&1 | Out-Null
    }
}

# ---------------------------------------------------------------- start
$apiArgs = @('api.py')
if ($Reload) { $apiArgs += '--reload' }

Write-Host 'Starting backend  (logs: backend\logs\api.log) ...' -ForegroundColor Cyan
$backendProc = Start-Process -FilePath $venvPy -ArgumentList $apiArgs -WorkingDirectory $backend -NoNewWindow -PassThru

Write-Host 'Starting frontend ...' -ForegroundColor Cyan
$frontendProc = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -WorkingDirectory $frontend -NoNewWindow -PassThru

try {
    if (-not (Wait-ForUrl "$apiUrl/health" 40)) {
        Write-Host 'Backend did not start within 40 seconds. Check backend\logs\api.log' -ForegroundColor Red
        return
    }
    if (-not (Wait-ForUrl $dashboardUrl 40)) {
        Write-Host 'Frontend did not start within 40 seconds.' -ForegroundColor Red
        return
    }

    Write-Host ''
    Write-Host "Job Tracker is running:" -ForegroundColor Green
    Write-Host "  Dashboard: $dashboardUrl"
    Write-Host "  API docs:  $apiUrl/docs"
    Write-Host '  Press Ctrl+C to stop both.'
    Write-Host ''

    if (-not $NoBrowser) { Start-Process $dashboardUrl }

    # Stay alive until one side exits (crash) or you press Ctrl+C.
    while (-not $backendProc.HasExited -and -not $frontendProc.HasExited) {
        Start-Sleep -Seconds 1
    }
    if ($backendProc.HasExited) { Write-Host 'Backend stopped.' -ForegroundColor Yellow }
    if ($frontendProc.HasExited) { Write-Host 'Frontend stopped.' -ForegroundColor Yellow }
}
finally {
    # Runs on Ctrl+C too: make sure nothing is left running in the background.
    Write-Host 'Shutting down ...' -ForegroundColor Cyan
    Stop-Tree $frontendProc
    Stop-Tree $backendProc
}
