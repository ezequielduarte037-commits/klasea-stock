$ErrorActionPreference = "Stop"

# Averigua sola con que driver, con que nombre y con que opciones responde la
# Pantum, y lo deja anotado para que el escaneo de todos los dias no adivine.
#
# La primera version fallaba con "sin imagen" aunque la impresora escaneaba de
# verdad: la captura andaba y lo que se rompia era el guardado. Por eso ahora
# prueba de a poco -primero el comando pelado, despues con cada opcion- y toma
# como buena cualquier corrida que deje un PDF, aunque NAPS2 devuelva un codigo
# de error. Todo lo que dice NAPS2 queda en un log para poder mirarlo.

$naps2 = "C:\Program Files\NAPS2\NAPS2.Console.exe"
$configFile = "C:\KlaseA\Scanner\scanner-config.json"
$pruebaDir = "C:\KlaseA\Scanner\prueba"
$logFile = "C:\KlaseA\Scanner\prueba\ultimo-intento.txt"

Clear-Host
Write-Host "KLASE A - CONFIGURAR EL SCANNER" -ForegroundColor Cyan
Write-Host "================================"
Write-Host "Voy a probar como responde la Pantum y a dejarlo anotado."
Write-Host ""
Write-Host "IMPORTANTE: pone un remito -o cualquier hoja- sobre el vidrio del" -ForegroundColor Yellow
Write-Host "scanner antes de seguir. Necesito hacer escaneos de prueba." -ForegroundColor Yellow
Write-Host ""
Read-Host "Cuando la hoja este puesta, presiona Enter"

if (-not (Test-Path -LiteralPath $naps2)) {
  Write-Host ""
  Write-Host "No encuentro NAPS2 en $naps2" -ForegroundColor Red
  Write-Host "Corre primero INSTALAR-EN-PANOL.cmd como administrador."
  Read-Host "Presiona Enter para cerrar"
  exit 1
}

if (Test-Path -LiteralPath $pruebaDir) { Remove-Item -LiteralPath $pruebaDir -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $pruebaDir | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $configFile) | Out-Null

$log = New-Object System.Text.StringBuilder
function Anotar { param([string]$Texto) [void]$log.AppendLine($Texto) }

# Corre NAPS2 con un tope de tiempo y devuelve todo lo que haya dicho.
function Invoke-Naps2 {
  param([string[]]$Argumentos, [int]$TimeoutSegundos = 150)

  $salidaFile = Join-Path $pruebaDir "stdout.txt"
  $errorFile = Join-Path $pruebaDir "stderr.txt"
  Anotar ("> NAPS2.Console.exe " + ($Argumentos -join " "))

  $proceso = Start-Process -FilePath $naps2 -ArgumentList $Argumentos -NoNewWindow -PassThru `
    -RedirectStandardOutput $salidaFile -RedirectStandardError $errorFile

  if (-not $proceso.WaitForExit($TimeoutSegundos * 1000)) {
    try { $proceso.Kill() } catch { }
    Anotar "  (se colgo, lo corte a los $TimeoutSegundos segundos)"
    return [pscustomobject]@{ Codigo = -1; Texto = "se colgo" }
  }

  $texto = ""
  foreach ($archivo in @($salidaFile, $errorFile)) {
    if (Test-Path -LiteralPath $archivo) {
      $texto += (Get-Content -LiteralPath $archivo -Raw -ErrorAction SilentlyContinue)
    }
  }
  Anotar ("  codigo de salida: " + $proceso.ExitCode)
  if ($texto.Trim()) { Anotar ("  dijo: " + $texto.Trim()) } else { Anotar "  no dijo nada" }
  return [pscustomobject]@{ Codigo = $proceso.ExitCode; Texto = $texto }
}

# ── Que equipos ve cada driver ───────────────────────────────────────────────
Write-Host ""
Write-Host "1/2 Preguntandole a cada driver que equipos ve..." -ForegroundColor Cyan

$combinaciones = @()
# escl es para scanners de red y en USB se cuelga 40 segundos al vicio.
foreach ($driver in @("twain", "wia")) {
  $resultado = Invoke-Naps2 -Argumentos @("--listdevices", "--driver", $driver) -TimeoutSegundos 40
  $equipos = @()
  foreach ($linea in ($resultado.Texto -split "\r?\n")) {
    $nombre = $linea.Trim()
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
  Write-Host "Revisa que este encendida y el cable USB."
  [System.IO.File]::WriteAllText($logFile, $log.ToString(), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Detalle en $logFile" -ForegroundColor DarkGray
  Read-Host "Presiona Enter para cerrar"
  exit 1
}

$combinaciones = @($combinaciones | Sort-Object @{ Expression = { $_.Equipo -notmatch "Pantum|M65" } })

# ── Escaneos de prueba, del comando mas pelado al mas completo ───────────────
# Si el pelado anda y el completo no, la culpa es de alguna opcion y asi se ve
# cual. Antes se probaba solo el completo y no habia forma de distinguirlo.
$variantes = @(
  [pscustomobject]@{ Nombre = "pelado";           Extra = @() },
  [pscustomobject]@{ Nombre = "con vidrio";       Extra = @("--source", "glass") },
  [pscustomobject]@{ Nombre = "con 300 dpi";      Extra = @("--source", "glass", "--dpi", "300") },
  [pscustomobject]@{ Nombre = "completo";         Extra = @("--source", "glass", "--dpi", "300", "--pagesize", "a4", "--bitdepth", "color", "--deskew") }
)

Write-Host ""
Write-Host "2/2 Probando escaneos reales..." -ForegroundColor Cyan
Write-Host "    (cada intento mueve la lampara: es normal que tarde)" -ForegroundColor DarkGray

$elegida = $null
foreach ($combinacion in $combinaciones) {
  foreach ($variante in $variantes) {
    $salidaPdf = Join-Path $pruebaDir ("prueba-{0}.pdf" -f ([guid]::NewGuid().ToString("N").Substring(0, 8)))
    Write-Host ("    {0} / {1} [{2}] ... " -f $combinacion.Driver, $combinacion.Equipo, $variante.Nombre) -NoNewline

    $argumentos = @("--output", $salidaPdf, "--noprofile", "--verbose",
                    "--driver", $combinacion.Driver, "--device", $combinacion.Equipo) + $variante.Extra
    $resultado = Invoke-Naps2 -Argumentos $argumentos

    # Vale si quedo un PDF con contenido, aunque NAPS2 devuelva codigo distinto
    # de cero: puede quejarse de algo menor y haber guardado igual.
    $archivo = Get-Item -LiteralPath $salidaPdf -ErrorAction SilentlyContinue
    if ($archivo -and $archivo.Length -gt 5KB) {
      Write-Host ("ANDA ({0} KB)" -f [math]::Round($archivo.Length / 1KB)) -ForegroundColor Green
      $elegida = [pscustomobject]@{ Driver = $combinacion.Driver; Equipo = $combinacion.Equipo; Extra = $variante.Extra; Variante = $variante.Nombre }
      break
    }

    $motivo = ($resultado.Texto -split "\r?\n" | Where-Object { $_.Trim() } | Select-Object -Last 1)
    if (-not $motivo) { $motivo = "no dijo nada" }
    Write-Host ("no ({0})" -f $motivo.Trim()) -ForegroundColor DarkGray
  }
  if ($elegida) { break }
}

[System.IO.File]::WriteAllText($logFile, $log.ToString(), (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
if (-not $elegida) {
  Write-Host "Ningun intento dejo un PDF." -ForegroundColor Red
  Write-Host ""
  Write-Host "Todo lo que dijo NAPS2 quedo en:" -ForegroundColor Yellow
  Write-Host "  $logFile" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Mandame ese archivo y te digo exactamente que pasa."
  Write-Host "Se abre solo en 3 segundos..."
  Start-Sleep -Seconds 3
  Start-Process notepad.exe $logFile
  Read-Host "Presiona Enter para cerrar"
  exit 1
}

$config = [ordered]@{
  driver = $elegida.Driver
  device = $elegida.Equipo
  extra = @($elegida.Extra)
  configuradoEl = (Get-Date).ToString("s")
}
[System.IO.File]::WriteAllText($configFile, ($config | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))

Write-Host "LISTO" -ForegroundColor Green
Write-Host ""
Write-Host ("  Driver   : {0}" -f $elegida.Driver)
Write-Host ("  Equipo   : {0}" -f $elegida.Equipo)
Write-Host ("  Opciones : {0}" -f $elegida.Variante)
Write-Host ""
Write-Host "Queda anotado en $configFile"
Write-Host "Ya podes escanear desde Klase A. No hace falta repetir esto."
Write-Host ""
Read-Host "Presiona Enter para cerrar"
