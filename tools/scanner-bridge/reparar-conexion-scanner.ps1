$ErrorActionPreference = "Stop"

$origin = "https://klasea-stock.vercel.app"
$bridgeUrl = "http://127.0.0.1:17778"
$bridgeFile = "C:\KlaseA\Scanner\scanner-bridge.mjs"
$pairingFile = Join-Path $env:LOCALAPPDATA "KlaseA\Scanner\codigo-vinculacion.txt"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  $arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $PSCommandPath
  Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
  exit 0
}

Clear-Host
Write-Host "KLASE A - REPARAR CONEXION DEL SCANNER" -ForegroundColor Cyan
Write-Host "========================================"
Write-Host "Esta herramienta solo habilita Klase A para conectarse al puente local de esta PC."
Write-Host "No cambia stock ni datos del sistema."
Write-Host ""

if (-not (Test-Path -LiteralPath $bridgeFile)) {
  throw "No encontre $bridgeFile. Ejecuta primero INSTALAR-EN-PANOL.cmd."
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { "C:\Program Files\nodejs\node.exe" }
if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Node.js no esta instalado. Ejecuta primero INSTALAR-EN-PANOL.cmd."
}

Write-Host "1/5 Habilitando acceso local exclusivo para Klase A..." -ForegroundColor Cyan
$policyNames = @(
  "LocalNetworkAccessAllowedForUrls",
  "LoopbackNetworkAccessAllowedForUrls",
  "LoopbackNetworkAllowedForUrls",
  "InsecurePrivateNetworkRequestsAllowedForUrls"
)
foreach ($policyName in $policyNames) {
  $policyPath = "HKLM:\SOFTWARE\Policies\Google\Chrome\$policyName"
  New-Item -Path $policyPath -Force | Out-Null
  New-ItemProperty -Path $policyPath -Name "1" -PropertyType String -Value $origin -Force | Out-Null
}
Write-Host "    Chrome autorizado solo para $origin" -ForegroundColor Green

Write-Host "2/5 Reiniciando el puente local..." -ForegroundColor Cyan
$existing = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $_.CommandLine -like "*C:\KlaseA\Scanner\scanner-bridge.mjs*"
}
foreach ($process in @($existing)) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 500
Start-Process -FilePath $nodePath -ArgumentList ('"{0}"' -f $bridgeFile) -WindowStyle Hidden

Write-Host "3/5 Verificando el puerto 17778..." -ForegroundColor Cyan
$health = $null
for ($attempt = 1; $attempt -le 15; $attempt += 1) {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri "$bridgeUrl/health" -TimeoutSec 2
    if ($health.ok) { break }
  } catch {
    $health = $null
  }
}
if (-not $health -or -not $health.ok) {
  throw "El puente no respondio en $bridgeUrl. Saca una foto de esta ventana."
}
Write-Host "    Puente OK - version $($health.version)" -ForegroundColor Green

Write-Host "4/5 Verificando permiso web y codigo..." -ForegroundColor Cyan
$corsResponse = Invoke-WebRequest -Uri "$bridgeUrl/health" -Headers @{ Origin = $origin } -UseBasicParsing -TimeoutSec 3
$allowedOrigin = [string]$corsResponse.Headers["Access-Control-Allow-Origin"]
if ($allowedOrigin -ne $origin) {
  throw "El puente responde, pero no autorizo el origen web de Klase A."
}

$pairingCode = ""
if (Test-Path -LiteralPath $pairingFile) {
  $match = Get-Content -LiteralPath $pairingFile -Raw | Select-String -Pattern '[A-F0-9]{16}' -AllMatches
  $pairingCode = $match.Matches.Value | Select-Object -First 1
}
if (-not $pairingCode) {
  throw "El puente funciona, pero no encontre el codigo en $pairingFile."
}
if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
  Set-Clipboard -Value $pairingCode
}
Write-Host "    Codigo copiado al portapapeles: $pairingCode" -ForegroundColor Green

Write-Host "5/5 Abriendo una version limpia de Klase A..." -ForegroundColor Cyan
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$appUrl = "$origin/recepcion-panol?tab=scanner&_appv=repair-$stamp"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcut = Join-Path $desktop "Klase A - Escanear remitos.url"
$shortcutBody = "[InternetShortcut]`r`nURL=$appUrl`r`n"
[System.IO.File]::WriteAllText($shortcut, $shortcutBody, [System.Text.Encoding]::ASCII)

$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chromePath = $chromeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if ($chromePath) {
  Start-Process -FilePath $chromePath -ArgumentList @("--new-window", $appUrl)
} else {
  Start-Process $appUrl
}

Write-Host ""
Write-Host "REPARACION TERMINADA" -ForegroundColor Green
Write-Host "Usa la ventana NUEVA que se acaba de abrir."
Write-Host "1. Hace clic en Codigo de vinculacion."
Write-Host "2. Presiona Ctrl+V."
Write-Host "3. Hace clic en Vincular."
Write-Host "4. Si Chrome pregunta por la red local, elegi Permitir."
Write-Host ""
[void](Read-Host "Presiona Enter cuando hayas terminado")

