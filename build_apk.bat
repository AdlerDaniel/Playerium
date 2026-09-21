@echo off
title Playerium - Android APK Builder
cd /d "%~dp0"

echo ========================================================
echo          Playerium: Building Android APK Package
echo ========================================================
echo.

:: 1. Copy web assets into android assets directory
echo [INFO] Syncing Playerium assets to Android project...
set "ASSETS_DIR=android\app\src\main\assets"
if not exist "%ASSETS_DIR%" mkdir "%ASSETS_DIR%"

xcopy /E /I /Y "index.html" "%ASSETS_DIR%\" >nul
xcopy /E /I /Y "css" "%ASSETS_DIR%\css" >nul
xcopy /E /I /Y "js" "%ASSETS_DIR%\js" >nul

echo [INFO] Web assets synced successfully.
echo.

:: 2. Check if Gradle is present
if exist "android\gradlew.bat" (
    echo [INFO] Running Gradle build...
    cd android
    call gradlew.bat assembleDebug
    cd ..
    if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
        copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "dist\Playerium.apk" >nul
        echo ========================================================
        echo  SUCCESS! Playerium APK is ready: dist\Playerium.apk
        echo ========================================================
    )
    pause
    exit /b 0
)

:: 3. Check for Android CLI or Android Studio
where android >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Android CLI detected.
)

echo [INFO] Android project is prepared in directory: .\android
echo [INFO] To compile the APK:
echo        1. Open folder 'android' in Android Studio and click 'Build APK', OR
echo        2. Run: cd android ^&^& gradlew assembleDebug
echo.
pause
