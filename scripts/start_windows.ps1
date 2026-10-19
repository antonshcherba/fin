# Build (if needed) and start the FinAlly container. Safe to run repeatedly.
# Usage: .\scripts\start_windows.ps1 [-Build] [-NoOpen]
param(
    [switch]$Build,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$Image = 'finally'
$Container = 'finally'
$Volume = 'finally-data'
$Port = 8000
$Url = "http://localhost:$Port"

Set-Location (Split-Path -Parent $PSScriptRoot)

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Docker is not running or not installed. Start Docker and try again.'
    exit 1
}

docker image inspect $Image *> $null
if ($Build -or $LASTEXITCODE -ne 0) {
    Write-Host "Building image '$Image'..."
    docker build -t $Image .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $Build = $true
}

$running = docker ps -q -f "name=^$Container$"
$exists = docker ps -aq -f "name=^$Container$"
if ($running -and -not $Build) {
    Write-Host "FinAlly is already running at $Url"
    exit 0
}
if ($exists) {
    docker rm -f $Container *> $null
}

$envArgs = @()
if (Test-Path '.env') {
    $envArgs = @('--env-file', '.env')
} else {
    Write-Warning '.env not found; copy .env.example to .env to configure API keys.'
}

docker run -d --name $Container -v "${Volume}:/app/db" -p "${Port}:8000" @envArgs $Image *> $null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host -NoNewline 'Waiting for FinAlly'
for ($i = 0; $i -lt 30; $i++) {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/health" -TimeoutSec 2 | Out-Null
        break
    } catch {
        Write-Host -NoNewline '.'
        Start-Sleep -Seconds 1
    }
}
Write-Host ''

Write-Host "FinAlly is running at $Url"

if (-not $NoOpen) {
    Start-Process $Url
}
