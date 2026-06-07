$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

Write-Host ""
Write-Host "Ballista - Tactical Command setup" -ForegroundColor Yellow
Write-Host "==================================" -ForegroundColor DarkYellow
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js was not found." -ForegroundColor Red
  Write-Host "Install the LTS version from: https://nodejs.org/"
  Write-Host "After installing Node.js, run setup.bat again."
  exit 1
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host "npm was not found. Reinstall Node.js LTS from https://nodejs.org/" -ForegroundColor Red
  exit 1
}

Write-Host "Node:" (node --version)
Write-Host "npm: " (npm --version)
Write-Host ""

Write-Host "Installing project files..." -ForegroundColor Cyan
npm install

Write-Host ""
Write-Host "Checking that the game can build..." -ForegroundColor Cyan
npm run build

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Use start.bat to launch the game."
