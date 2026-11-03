@echo off
chcp 65001 > nul
title AriaVMS Pro - EXE Installer Builder
color 0B

echo ===================================================
echo     AriaVMS Pro - Windows EXE Installer Builder
echo ===================================================
echo.

if not exist "node_modules\" (
    echo [1/2] Installing dependencies...
    call npm install --legacy-peer-deps
)

if not exist "node_modules\electron-builder\" (
    echo [2/2] Installing electron-builder...
    call npm install --save-dev electron electron-builder --legacy-peer-deps
)

echo.
echo Building Windows .exe installer package...
echo Please wait, this may take 1-2 minutes...
echo.

call npx electron-builder --win

if %errorlevel% equ 0 (
    echo.
    color 0A
    echo ===================================================
    echo  SUCCESS! .exe installer created in "dist-electron"
    echo ===================================================
) else (
    echo.
    color 0C
    echo [ERROR] Build failed. Please check logs above.
)

pause
