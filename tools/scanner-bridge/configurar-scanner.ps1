$ErrorActionPreference = "Stop"

# Averigua sola con que driver y con que nombre exacto responde la Pantum, y lo
# deja anotado para que el escaneo de todos los dias no tenga que adivinar.
#
# Hacia falta porque el nombre del equipo NO es el mismo en cada driver: por WIA
# puede llamarse "Pantum M6550 Series" y por TWAIN "Pantum M6500 Series TWAIN".
# El script viejo lo buscaba por WIA y se lo pasaba a NAPS2 en modo TWAIN, asi
# que NAPS2 no encontraba nada y cortaba con "no pudo obtener la imagen".
#
# En vez de suponer, prueba cada combinacion con un escaneo real y se queda con
# la primera que devuelve un PDF.

$naps2 = "C:\Program Files\NAPS2\NAPS2.Console.exe"
$configFile = "C:\KlaseA\Scanner\scanner-config.json"
$pruebaDir = Join-Path $env:TEMP "klasea-prueba-scanner"

Clear-Host
Write-Host "KLASE A - CONFIGURAR EL SCANNER" -ForegroundColor Cyan
Write-Host "================================"
Write-Host "Voy a probar como responde la Pantum y a dejarlo anotado."
Write-Host ""
Write-Host "IMPORTANTE: pone un remito -o cualquier hoja- sobre el vidrio del" -ForegroundColor Yellow
Write-Host "scanner antes de seguir. Necesito hacer un escaneo de prueba." -ForegroundColor Yellow
Write-Host ""
Read-Host "Cuando la hoja este puesta, presiona Enter"

if (-not (Test-Path -LiteralPath $naps2)) {
  Write-Host ""
  Write-Host "No encuentro NAPS2 en $naps2" -ForegroundColor Red
  Write-Host "Corre primero INSTALAR-EN-PANOL.cmd como administrador."
  Read-Host "Presiona Enter para cerrar"
  exit 1
}

New-Item -ItemType Directory -Force -Path $pruebaDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $configFile) | Out-Null

# Corre NAPS2 con un tope de tiempo y devuelve la salida de texto.
function Invoke-Naps2 {
  param([string[]]$Argumentos, [int]$TimeoutSegundos = 120)

  $salidaFile = Join-Path $pruebaDir "salida.txt"
  $errorFile = Join-Path $pruebaDir "error.txt"
  $proceso = Start-Process -FilePath $naps2 -ArgumentList $Argumentos -NoNewWindow -PassThru `
    -RedirectStandardOutput $salidaFile -RedirectStandardError $errorFile

  if (-not $proceso.WaitForExit($TimeoutSegundos * 1000)) {
    try { $proceso.Kill() } catch { }
    return [pscustomobject]@{ Codigo = -1; Texto = "(se colgo, lo corte a los $TimeoutSegundos segundos)" }
  }

  $texto = ""
  foreach ($archivo in @($salidaFile, $errorFile)) {
    if (Test-Path -LiteralPath $archivo) {
      $texto += (Get-Content -LiteralPath $archivo -Raw -ErrorAction SilentlyContinue)
    }
  }
  return [pscustomobject]@{ Codigo = $proceso.ExitCode; Texto = $texto }
}

Write-Host ""
Write-Host "1/2 Preguntandole a cada driver que equipos ve..." -ForegroundColor Cyan

$combinaciones = @()
foreach ($driver in @("twain", "wia", "escl")) {
  $resultado = Invoke-Naps2 -Argumentos @("--listdevices", "--driver", $driver) -TimeoutSegundos 40
  $equipos = @()
  foreach ($linea in ($resultado.Texto -split "\r?\n")) {
    $nombre = $linea.Trim()
    # Se descartan las lineas que no son nombres de equipo.
    if (-not $nombre) { continue }
    if ($nombre -match "^(Error|Usage|No devices|NAPS2|Warning|Exception|\s*at\s)") { continue }
    $equipos += $nombre
  }

  if ($equipos.Count -eq 0) {
    Write-Host ("    {0,-6} no ve ningun equipo" -f $driver) -ForegroundColor DarkGray
  } else {
    foreach ($equipo in $equipos) {
      Write-Host ("    {0,-6} {1}" -f $driver, $equipo) -ForegroundColor Gray
      $combinaciones += [pscustomobject]@{ Driver = $driver; Equipo = $equipo }
    }
  }
}

if ($combinaciones.Count -eq 0) {
  Write-Host ""
  Write-Host "Ningun driver ve la Pantum." -ForegroundColor Red
  Write-Host "Revisa que este encendida, el cable USB, y que aparezca en"
  Write-Host "Configuracion de Windows > Bluetooth y dispositivos > Impresoras."
  Read-Host "Presiona Enter para cerrar"
  exit 1
}

# La Pantum primero: si hay otros equipos -una camara, una impresora virtual-
# no tiene sentido gastarles un escaneo de prueba antes que al que buscamos.
$combinaciones = @($combinaciones | Sort-Object @{ Expression = { $_.Equipo -notmatch "Pantum|M65" } })

Write-Host ""
Write-Host "2/2 Probando un escaneo real con cada una..." -ForegroundColor Cyan

$elegida = $null
foreach ($combinacion in $combinaciones) {
  $salidaPdf = Join-Path $pruebaDir ("prueba-{0}.pdf" -f ([guid]::NewGuid().ToString("N").Substring(0, 8)))
  Write-Host ("    {0} / {1} ... " -f $combinacion.Driver, $combinacion.Equipo) -NoNewline

  $resultado = Invoke-Naps2 -TimeoutSegundos 150 -Argumentos @(
    "--output", $salidaPdf,
    "--noprofile",
    "--driver", $combinacion.Driver,
    "--device", $combinacion.Equipo,
    "--source", "glass",
    "--dpi", "300",
    "--pagesize", "a4",
    "--bitdepth", "color",
    "--deskew"
  )

  if ($resultado.Codigo -eq 0 -and (Test-Path -LiteralPath $salidaPdf)) {
    $kb = [math]::Round((Get-Item -LiteralPath $salidaPdf).Length / 1KB)
    Write-Host ("ANDA ({0} KB)" -f $kb) -ForegroundColor Green
    $elegida = $combinacion
    Remove-Item -LiteralPath $salidaPdf -Force -ErrorAction SilentlyContinue
    break
  }

  $motivo = ($resultado.Texto -split "\r?\n" | Where-Object { $_.Trim() } | Select-Object -First 1)
  if (-not $motivo) { $motivo = "sin imagen" }
  Write-Host ("no ({0})" -f $motivo.Trim()) -ForegroundColor DarkGray
}

Write-Host ""
if (-not $elegida) {
  Write-Host "Ningun driver logro escanear." -ForegroundColor Red
  Write-Host ""
  Write-Host "Proba esto y volve a correr este script:"
  Write-Host "  1. Apaga la Pantum, espera 10 segundos y prendela."
  Write-Host "  2. Desenchufa y volve a enchufar el cable USB."
  Write-Host "  3. Fijate que no haya otro programa de escaneo abierto."
  Write-Host ""
  Write-Host "Si sigue igual, saca una foto de esta ventana." -ForegroundColor Yellow
  Read-Host "Presiona Enter para cerrar"
  exit 1
}

$config = [ordered]@{
  driver = $elegida.Driver
  device = $elegida.Equipo
  configuradoEl = (Get-Date).ToString("s")
}
[System.IO.File]::WriteAllText($configFile, ($config | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))

Write-Host "LISTO" -ForegroundColor Green
Write-Host ""
Write-Host ("  Driver : {0}" -f $elegida.Driver)
Write-Host ("  Equipo : {0}" -f $elegida.Equipo)
Write-Host ""
Write-Host "Queda anotado en $configFile"
Write-Host "Ya podes escanear desde Klase A. No hace falta repetir esto."
Write-Host ""
Read-Host "Presiona Enter para cerrar"
