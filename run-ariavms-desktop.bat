@echo off
chcp 65001 > nul
title AriaVMS Pro - Desktop Launcher
color 0A

echo ===================================================
echo     AriaVMS Pro - Auto Setup & Launcher for Windows
echo ===================================================
echo.

:: Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed on this system!
    echo Please download and install Node.js (v18+) from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo [1/3] Checking Node.js environment... OK.

:: Check node_modules and install dependencies automatically if needed
if not exist "node_modules\" (
    echo [2/3] Installing application dependencies (npm install)...
    call npm install --legacy-peer-deps
) else (
    echo [2/3] Dependencies already installed.
)

:: Check electron installation
if not exist "node_modules\electron\" (
    echo [3/3] Installing Electron desktop runner...
    call npm install --save-dev electron electron-builder --legacy-peer-deps
) else (
    echo [3/3] Electron desktop runner ready.
)

echo.
echo ===================================================
echo    Starting AriaVMS Pro Desktop Application...
echo ===================================================
echo.

call npm run electron

if %errorlevel% neq 0 (
    echo.
    color 0C
    echo [ERROR] Application exited with error code %errorlevel%.
    pause
)
