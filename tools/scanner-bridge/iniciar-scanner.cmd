@echo off
setlocal
start "Klasea Scanner" /MIN node "%~dp0scanner-bridge.mjs"
endlocal
