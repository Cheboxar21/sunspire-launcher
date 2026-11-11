@echo off
setlocal
title SUNSPIRE LAUNCHER
cd /d "%~dp0"

if exist "src-tauri\target\release\sunspire.exe" (
  start "" "src-tauri\target\release\sunspire.exe"
  exit /b 0
)

if exist "src-tauri\target\debug\sunspire.exe" (
  start "" "src-tauri\target\debug\sunspire.exe"
  exit /b 0
)

echo.
echo [SUNSPIRE] Rust-сборка не найдена.
echo Соберите её командой:  npm run tauri:build
echo Или запустите установщик из src-tauri\target\release\bundle\nsis\
echo.
pause
exit /b 1
