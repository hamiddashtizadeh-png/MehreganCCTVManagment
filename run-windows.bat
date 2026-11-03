@echo off
chcp 65001 > nul
title AriaVMS Pro - Windows Quick Launcher
color 0A

echo ===================================================
echo     AriaVMS Pro - Windows Quick Launcher
echo ===================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed! Download Node.js from https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [1/3] Installing required npm packages...
    call npm install --legacy-peer-deps
)

if not exist "node_modules\electron\" (
    echo [2/3] Setting up Electron Desktop Runner...
    call npm install --save-dev electron electron-builder --legacy-peer-deps
)

if not exist "dist\index.html" (
    echo [3/3] Building frontend assets (vite build)...
    call npm run build
)

echo.
echo Starting AriaVMS Pro Desktop App...
echo.
call npm run electron

if %errorlevel% neq 0 (
    echo.
    color 0C
    echo [ERROR] Launch failed.
    pause
)
