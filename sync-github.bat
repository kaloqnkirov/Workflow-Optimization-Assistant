@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Качване на проекта в GitHub

echo ========================================
echo   Папка: %CD%
echo ========================================
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [ГРЕШКА] Git не е в PATH. Инсталирай от https://git-scm.com/download/win
    pause
    exit /b 1
)

if not exist ".git" (
    echo [Стъпка 1] git init...
    git init
    git branch -M main
)

echo [Стъпка 2] git add -A
git add -A
git status --short

echo.
echo [Стъпка 3] git commit
git commit -m "Обновяване на проекта"
if errorlevel 1 echo (Няма промени или вече е commit-нато - продължавам...)

echo.
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo --------------------------------------------------
    echo НЯМА връзка с GitHub ^(remote origin^).
    echo.
    echo 1) В GitHub отвори repo-то - зелен бутон Code - копирай HTTPS
    echo 2) Тук долу изпълни ^(смени URL^):
    echo    git remote add origin https://github.com/АКАУНТ/ИМЕ.git
    echo 3) После пак пусни този sync-github.bat
    echo --------------------------------------------------
    pause
    exit /b 0
)

echo [Стъпка 4] git push...
git push -u origin main
if errorlevel 1 (
    echo.
    echo Ако грешка: опитай  git push -u origin master
    echo Или първо:     git pull origin main --allow-unrelated-histories
    echo За вход ползвай TOKEN от GitHub, не паролата на сайта.
)
echo.
pause
