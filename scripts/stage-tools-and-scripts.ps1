# Добавя към Git само папките scripts/ и .tools/ (за commit + push в GitHub Desktop или терминал).
# Стартиране от папката на проекта:
#   powershell -ExecutionPolicy Bypass -File .\scripts\stage-tools-and-scripts.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$git = @(
    "$env:ProgramFiles\Git\cmd\git.exe",
    "$env:ProgramFiles\Git\bin\git.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $git) {
    Write-Host "Не е намерен git.exe. Инсталирай Git for Windows и опитай пак." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path ".git")) {
    Write-Host "В тази папка няма .git — първо: git init" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path "scripts")) { Write-Host "Липсва папка scripts\" -ForegroundColor Yellow }
if (-not (Test-Path ".tools")) { Write-Host "Липсва папка .tools\ — свали с: npm run setup-node" -ForegroundColor Yellow }

& $git add scripts/
if (Test-Path ".tools") { & $git add .tools/ }

Write-Host "`nСтатус след добавяне:" -ForegroundColor Cyan
& $git status --short

Write-Host "`nСледва: Commit в GitHub Desktop (или: git commit -m \"Add scripts and .tools\" && git push)" -ForegroundColor Green
