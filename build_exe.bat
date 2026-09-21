@echo off
title Playerium - Windows EXE Builder
cd /d "%~dp0"

echo ========================================================
echo          Playerium: Building Windows .EXE Package
echo ========================================================
echo.

where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js and npm were not found in PATH!
    echo Please install Node.js from https://nodejs.org to build Windows EXE.
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo [INFO] Installing required build tools (electron and electron-builder)...
    call npm install
)

echo [INFO] Building Playerium Installer and Portable .EXE...
echo [INFO] Output directory: .\dist
echo.

call npm run build:win

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  SUCCESS! Playerium .EXE files are ready in .\dist
    echo  - Installer: dist\Playerium Setup 1.0.0.exe
    echo  - Portable:  dist\Playerium 1.0.0.exe
    echo ========================================================
    echo.
) else (
    echo.
    echo [ERROR] Build encountered an error. Please check log above.
    echo.
)

pause
