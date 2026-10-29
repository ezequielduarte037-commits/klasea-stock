@echo off
setlocal
powershell -NoProfile -Command "if (([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Haga clic derecho en INSTALAR.cmd y elija Ejecutar como administrador.
  pause
  exit /b 1
)
echo Instalando controlador DeTong P1S / P1 Label Printer...
pnputil /add-driver "%~dp0Controlador\P1.inf" /install
if errorlevel 1 (
  echo Windows no pudo agregar el controlador. Revise el mensaje anterior.
  pause
  exit /b 1
)
powershell -NoProfile -Command "try { Add-PrinterDriver -Name 'P1 Label Printer' -ErrorAction Stop; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo El paquete se agrego, pero Windows no pudo registrar la impresora.
  echo Abra Impresoras y escaneres, Agregar impresora, Usar disco, y seleccione Controlador\P1.inf.
  pause
  exit /b 1
)
echo.
echo Controlador agregado. Conecte la termica por USB y enciendala.
echo Si ya estaba conectada, desconecte y vuelva a conectar el cable.
echo Al imprimir elija P1 Label Printer o P1S Label Printer.
echo Para el rollo chico: papel 40 x 30 mm y escala 100 por ciento.
pause
