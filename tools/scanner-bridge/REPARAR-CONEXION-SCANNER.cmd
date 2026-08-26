@echo off
title Klase A - Reparar conexion scanner

net session >nul 2>&1
if not %errorlevel%==0 (
  echo Solicitando permisos de administrador...
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0reparar-conexion-scanner.ps1"
if errorlevel 1 (
  echo.
  echo La reparacion no termino correctamente. Saca una foto de esta ventana.
) else (
  echo.
  echo Reparacion finalizada. Si la web ya se abrio, podes cerrar esta ventana.
)
pause
