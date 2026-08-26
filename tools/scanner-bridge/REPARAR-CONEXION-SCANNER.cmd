@echo off
title Klase A - Reparar conexion scanner
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0reparar-conexion-scanner.ps1"
if errorlevel 1 (
  echo.
  echo La reparacion no termino correctamente. Saca una foto de esta ventana.
  pause
)

