$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ServerDir = Join-Path $ProjectRoot ".server"
$PidFile = Join-Path $ServerDir "vite.pid"

Write-Host ""
Write-Host "Stopping Ballista - Tactical Command" -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor DarkYellow
Write-Host ""

if (-not (Test-Path $PidFile)) {
  $connection = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $connection) {
    Write-Host "No saved server process found." -ForegroundColor DarkYellow
    exit 0
  }
  $pidValue = $connection.OwningProcess
} else {
  $pidValue = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
}

if (-not $pidValue) {
  Remove-Item -LiteralPath $PidFile -ErrorAction SilentlyContinue
  Write-Host "No saved server process found." -ForegroundColor DarkYellow
  exit 0
}

$stopped = $false

$process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
if ($process) {
  Stop-Process -Id $pidValue -ErrorAction SilentlyContinue
  $stopped = $true
}

for ($i = 0; $i -lt 5; $i++) {
  $connections = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) { break }

  foreach ($connection in $connections) {
    $owner = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if ($owner) {
      Stop-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
      $stopped = $true
    }
  }

  Start-Sleep -Milliseconds 500
}

if ($stopped) {
  Write-Host "Server stopped." -ForegroundColor Green
} else {
  Write-Host "Saved server process was not running." -ForegroundColor DarkYellow
}

Remove-Item -LiteralPath $PidFile -ErrorAction SilentlyContinue
