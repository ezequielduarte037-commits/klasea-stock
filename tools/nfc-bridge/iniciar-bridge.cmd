@echo off
REM ---------------------------------------------------------------
REM Arranque del bridge NFC para el usuario de PANOL.
REM Copiar este archivo a la carpeta de Inicio del usuario panol:
REM   shell:startup   ->  %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
REM Asi el lector queda listo apenas inicia sesion, sin que nadie
REM tenga que abrir nada a mano.
REM ---------------------------------------------------------------

REM /MIN lo deja minimizado para que no moleste en pantalla.
start "Klasea NFC" /MIN "C:\klasea\nfc\KlaseaNfcBridge.exe"
