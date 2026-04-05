# Качва всички файлове от папката на проекта в GitHub (след като вече имаш git remote).
# Стартиране: десен бутон -> Run with PowerShell
# Или в терминал:  powershell -ExecutionPolicy Bypass -File scripts\push-all-to-github.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$git = $null
foreach ($c in @(
    "$env:ProgramFiles\Git\cmd\git.exe",
    "$env:ProgramFiles\Git\bin\git.exe",
    "${env:ProgramFiles(x86)}\Git\cmd\git.exe"
)) {
    if (Test-Path $c) { $git = $c; break }
}
if (-not $git) {
    Write-Host "Git не е намерен. Инсталирай Git for Windows и рестартирай терминала." -ForegroundColor Red
    Write-Host "https://git-scm.com/download/win"
    exit 1
}

Write-Host "Папка: $root" -ForegroundColor Cyan
& $git status

if (-not (Test-Path (Join-Path $root ".git"))) {
    Write-Host "`nНяма .git — първо: git init" -ForegroundColor Yellow
    & $git init
}

& $git add -A
& $git status

$msg = Read-Host "`nСъобщение за commit (Enter за 'Update project')"
if ([string]::IsNullOrWhiteSpace($msg)) { $msg = "Update project" }
& $git commit -m $msg
if ($LASTEXITCODE -ne 0) {
    Write-Host "Commit неуспешен (може би няма промени). Провери дали има нещо за commit." -ForegroundColor Yellow
}

$remote = & $git remote get-url origin 2>$null
if (-not $remote) {
    Write-Host "`nНяма remote 'origin'. Добави repo от GitHub:" -ForegroundColor Yellow
    Write-Host '  git remote add origin https://github.com/АКАУНТ/РЕПО.git'
    Write-Host "После пусни пак този скрипт или: git push -u origin main"
    exit 0
}

Write-Host "`nPush към: $remote" -ForegroundColor Cyan
& $git push
if ($LASTEXITCODE -eq 0) {
    Write-Host "`nГотово — файловете са в GitHub." -ForegroundColor Green
} else {
    Write-Host "`nPush неуспешен — влез в GitHub (token) или провери мрежата." -ForegroundColor Red
}
