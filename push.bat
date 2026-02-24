@echo off
REM ================================
REM  Git Auto‑Push Script
REM  Usage: push "your commit message"
REM ================================

IF "%~1"=="" (
    echo You must provide a commit message.
    echo Example: push "Updated roster logic"
    exit /b 1
)

echo.
echo Adding all changes...
git add -A

echo.
echo Committing with message: %~1
git commit -m "%~1"

echo.
echo Pushing to GitHub...
git push

echo.
echo Done!
pause