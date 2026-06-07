$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ServerDir = Join-Path $ProjectRoot ".server"
$PidFile = Join-Path $ServerDir "vite.pid"
$OutLog = Join-Path $ServerDir "vite.out.log"
$ErrLog = Join-Path $ServerDir "vite.err.log"
$Url = "http://127.0.0.1:5173/"

Set-Location $ProjectRoot
New-Item -ItemType Directory -Force -Path $ServerDir | Out-Null

Write-Host ""
Write-Host "Starting Ballista - Tactical Command" -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor DarkYellow
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js/npm was not found. Run setup.bat after installing Node.js LTS." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
  Write-Host "Project is not set up yet. Please run setup.bat first." -ForegroundColor Red
  exit 1
}

if (Test-Path $PidFile) {
  $oldPid = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
    Write-Host "Game server is already running. Opening browser..." -ForegroundColor Green
    Start-Process $Url
    Write-Host ""
    Write-Host "URL: $Url"
    exit 0
  }
}

try {
  Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 | Out-Null
  $connection = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($connection) { $connection.OwningProcess | Set-Content $PidFile }
  Write-Host "Game server is already running. Opening browser..." -ForegroundColor Green
  Start-Process $Url
  Write-Host ""
  Write-Host "URL: $Url"
  exit 0
} catch {
}

Write-Host "Launching local game server..." -ForegroundColor Cyan
$process = Start-Process -FilePath "npm.cmd" `
  -ArgumentList @("run", "start", "--", "--strictPort") `
  -WorkingDirectory $ProjectRoot `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog `
  -WindowStyle Hidden `
  -PassThru

$process.Id | Set-Content $PidFile

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 | Out-Null
    $ready = $true
    break
  } catch {
  }
}

if (-not $ready) {
  Write-Host "The server did not become ready on $Url." -ForegroundColor Red
  Write-Host "Error log:"
  if (Test-Path $ErrLog) { Get-Content $ErrLog -Tail 20 }
  Write-Host ""
  Write-Host "Try stop.bat, then start.bat again."
  exit 1
}

Write-Host "Game server is ready." -ForegroundColor Green
Write-Host "Opening browser: $Url"
Start-Process $Url
Write-Host ""
Write-Host "Leave this window open if you want the status message visible."
Write-Host "Use stop.bat when you are done."
