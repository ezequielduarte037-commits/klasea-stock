@echo off
setlocal
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0configurar-scanner.ps1"
endlocal
