@echo off
title Spotify Local Player
cd /d "%~dp0"

echo ========================================================
echo             Spotify Local Music Player
echo ========================================================
echo.

:: Function to launch browser in app window mode if possible
set "LAUNCH_URL=http://localhost:5173"

:: Helper script to open browser after server starts
start "" cmd /c "timeout /t 2 /nobreak >nul & where msedge >nul 2>&1 && (start msedge --app=%LAUNCH_URL%) || (where chrome >nul 2>&1 && start chrome --app=%LAUNCH_URL% || start %LAUNCH_URL%)"

:: 1. If Python is installed, run Python HTTP server
where python >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Starting local server via Python on port 5173...
    python -m http.server 5173
    exit /b
)

:: 2. If Node is installed, run via npx serve
where npx >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Starting local server via Node npx...
    call npx serve -p 5173 .
    exit /b
)

:: 3. PowerShell embedded HTTP server (standard on Windows 10/11)
echo [INFO] Starting Windows built-in HTTP server on port 5173...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$port = 5173; $listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add(\"http://localhost:$port/\"); $listener.Start(); Write-Host \"Player server is active at http://localhost:$port (Press Ctrl+C to stop)\"; while($listener.IsListening) { try { $context = $listener.GetContext(); $req = $context.Request; $res = $context.Response; $path = $req.Url.LocalPath.TrimStart('/'); if([string]::IsNullOrEmpty($path)) { $path = 'index.html' }; $localPath = Join-Path (Get-Location) $path; if(Test-Path $localPath) { $bytes = [System.IO.File]::ReadAllBytes($localPath); $ext = [System.IO.Path]::GetExtension($localPath).ToLower(); switch($ext) { '.html' { $res.ContentType = 'text/html; charset=utf-8' } '.js' { $res.ContentType = 'application/javascript; charset=utf-8' } '.css' { $res.ContentType = 'text/css; charset=utf-8' } '.svg' { $res.ContentType = 'image/svg+xml' } '.json' { $res.ContentType = 'application/json' } default { $res.ContentType = 'application/octet-stream' } }; $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length); $res.Close(); } else { $res.StatusCode = 404; $res.Close(); } } catch {} }"
pause
