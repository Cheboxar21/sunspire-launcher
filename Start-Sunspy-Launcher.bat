@echo off
title SUNSPY LAUNCHER
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 >nul & start msedge --app=http://localhost:5173 --window-size=1360,840"
npm run dev
