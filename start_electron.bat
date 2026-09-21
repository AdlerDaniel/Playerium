@echo off
title Spotify Local Player - Electron Desktop
cd /d "%~dp0"

echo ========================================================
echo       Starting Spotify Local Player (Electron)
echo ========================================================
echo.

where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js and npm are not found in PATH!
    echo Please install Node.js from https://nodejs.org
    echo.
    echo Tip: You can run start.bat to use the player right away without Node.js!
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\electron" (
    echo [INFO] Electron is not installed yet. Installing dependencies...
    echo [INFO] This downloads ~90MB (once) and may take 1-2 minutes.
    call npm install
)

echo.
echo [INFO] Launching Spotify Electron Window...
call npx electron .

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [INFO] Retrying with clean electron install...
    call npm install electron --save-dev
    call npx electron .
)

pause
