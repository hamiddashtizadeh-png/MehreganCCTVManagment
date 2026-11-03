@echo off
chcp 65001 > nul
title AriaVMS Pro - Desktop Launcher
color 0A

echo ===================================================
echo     AriaVMS Pro - Auto Setup & Launcher for Windows
echo ===================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed on this system!
    echo Please download and install Node.js (v18+) from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo [1/4] Checking Node.js environment... OK.

if not exist "node_modules\" (
    echo [2/4] Installing application dependencies (npm install)...
    call npm install --legacy-peer-deps
) else (
    echo [2/4] Dependencies ready.
)

if not exist "node_modules\electron\" (
    echo [3/4] Installing Electron desktop runner...
    call npm install --save-dev electron electron-builder --legacy-peer-deps
) else (
    echo [3/4] Electron desktop runner ready.
)

if not exist "dist\index.html" (
    echo [4/4] Building web assets for desktop...
    call npm run build
) else (
    echo [4/4] Desktop assets ready.
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
