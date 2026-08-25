@echo off
setlocal
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-panol.ps1"
echo.
echo Si ves un error, saca una foto de esta ventana antes de cerrarla.
pause
endlocal
