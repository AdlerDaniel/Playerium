@echo off
title Playerium - GitHub Publisher
cd /d "%~dp0"

echo ========================================================
echo          Playerium: Publishing to GitHub
echo ========================================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

node scripts\publish_to_github.js

pause
