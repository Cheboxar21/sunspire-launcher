@echo off
setlocal
cd /d "%~dp0.."

rem MinGW binutils are required by the GNU Rust target (dlltool/windres).
set "MINGW=%LOCALAPPDATA%\Temp\opencode\winlibs\mingw64\bin"
if exist "%MINGW%\dlltool.exe" (
  set "PATH=%MINGW%;%PATH%"
) else (
  where dlltool.exe >nul 2>nul
  if errorlevel 1 (
    echo [SUNSPIRE] dlltool.exe not found.
    echo Install WinLibs MinGW or switch to the MSVC Rust target.
    pause
    exit /b 1
  )
)

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
call npm run tauri:build
if errorlevel 1 (
  echo.
  echo [SUNSPIRE] Build failed.
  pause
  exit /b 1
)

echo.
echo Installer:
echo   src-tauri\target\release\bundle\nsis\
pause
