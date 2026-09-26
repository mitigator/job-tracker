<#
.SYNOPSIS
    One-time setup for Job Tracker: Python venv + packages, .env files, database, frontend packages.

.EXAMPLE
    .\setup.ps1
    (If scripts are blocked:  powershell -ExecutionPolicy Bypass -File .\setup.ps1)

    Safe to run again: it skips what's already done and updates packages.
#>

# Native tools (pip, npm) write warnings to stderr; we check exit codes ourselves instead.
$ErrorActionPreference = 'Continue'

$root     = $PSScriptRoot
$backend  = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$venvDir  = Join-Path $backend '.venv'
$venvPy   = Join-Path $venvDir 'Scripts\python.exe'

function Write-Step([string]$message) { Write-Host "`n==> $message" -ForegroundColor Cyan }

function Assert-Success([string]$what) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $what (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}

# ---------------------------------------------------------------- prerequisites
Write-Step 'Checking Python (3.10+) and Node.js (20.19+ or 22.12+)'
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host 'Python not found. Install it from https://www.python.org/downloads/ and tick "Add to PATH".' -ForegroundColor Red
    exit 1
}
& python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
Assert-Success 'Python 3.10 or newer is required'

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host 'Node.js not found. Install the LTS version from https://nodejs.org/' -ForegroundColor Red
    exit 1
}
Write-Host "Python: $(& python --version)   Node: $(& node --version)"

# ---------------------------------------------------------------- backend
Write-Step 'Creating Python virtual environment (backend\.venv)'
if (Test-Path $venvPy) {
    Write-Host 'Already exists, reusing it.'
} else {
    & python -m venv $venvDir
    Assert-Success 'Creating the virtual environment'
}

Write-Step 'Installing Python packages'
& $venvPy -m pip install --upgrade pip --quiet
Assert-Success 'Upgrading pip'
& $venvPy -m pip install -r (Join-Path $backend 'requirements.txt')
Assert-Success 'Installing requirements.txt'
# python-jobspy pins numpy==1.26.3 (no wheels for Python 3.12+), so install it without its deps.
& $venvPy -m pip install --no-deps python-jobspy==1.1.82
Assert-Success 'Installing python-jobspy'

Write-Step 'Creating .env files (existing files are kept)'
$backendEnv = Join-Path $backend '.env'
if (-not (Test-Path $backendEnv)) {
    Copy-Item (Join-Path $backend '.env.example') $backendEnv
    Write-Host 'Created backend\.env  ->  paste your Gemini key into it (https://aistudio.google.com/apikey)' -ForegroundColor Yellow
} else {
    Write-Host 'backend\.env already exists.'
}
$frontendEnv = Join-Path $frontend '.env'
if (-not (Test-Path $frontendEnv)) {
    Copy-Item (Join-Path $frontend '.env.example') $frontendEnv
    Write-Host 'Created frontend\.env'
} else {
    Write-Host 'frontend\.env already exists.'
}

Write-Step 'Creating the database'
Push-Location $backend
& $venvPy db.py
$dbExit = $LASTEXITCODE
Pop-Location
if ($dbExit -ne 0) { Write-Host 'FAILED: creating the database' -ForegroundColor Red; exit 1 }

Write-Step 'Running backend self-tests'
Push-Location $backend
& $venvPy test_setup.py | Select-Object -Last 1
$testExit = $LASTEXITCODE
Pop-Location
if ($testExit -ne 0) { Write-Host 'FAILED: backend self-test' -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- frontend
Write-Step 'Installing frontend packages (npm install)'
Push-Location $frontend
& npm install
$npmExit = $LASTEXITCODE
Pop-Location
if ($npmExit -ne 0) { Write-Host 'FAILED: npm install' -ForegroundColor Red; exit 1 }

Write-Host "`nSetup complete." -ForegroundColor Green
Write-Host 'Next:'
Write-Host '  1. Put your Gemini key in backend\.env (if you have not already)'
Write-Host '  2. Start everything:        .\start.ps1   (or double-click start.bat)'
Write-Host '  3. Schedule the daily run:  .\scripts\register-daily-task.ps1'
