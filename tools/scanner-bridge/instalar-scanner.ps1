$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetDir = "C:\KlaseA\Scanner"
$pendingDir = "C:\KlaseA\Remitos\Pendientes"
$processedDir = "C:\KlaseA\Remitos\Procesados"
$configDir = Join-Path $env:LOCALAPPDATA "KlaseA\Scanner"
$pairingFile = Join-Path $configDir "codigo-vinculacion.txt"
$scanErrorFile = Join-Path $configDir "ultimo-error.txt"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupFile = Join-Path $startupDir "KlaseA Scanner.cmd"
$desktopDir = [Environment]::GetFolderPath("Desktop")

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { "C:\Program Files\nodejs\node.exe" }
if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Node.js no esta instalado. Ejecuta primero INSTALAR-EN-PANOL.cmd."
}

New-Item -ItemType Directory -Force -Path $targetDir, $pendingDir, $processedDir, $configDir | Out-Null
Remove-Item -LiteralPath $scanErrorFile -Force -ErrorAction SilentlyContinue

$bridgeFiles = @(
  "scanner-bridge.mjs",
  "iniciar-scanner.cmd",
  "escanear-remito.ps1",
  "diagnosticar-scanner.ps1"
)
foreach ($file in $bridgeFiles) {
  $source = Join-Path $sourceDir $file
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $targetDir $file) -Force
  }
}

$startupBody = "@echo off`r`nstart `"KlaseA Scanner`" /MIN `"$nodePath`" `"$targetDir\scanner-bridge.mjs`"`r`n"
[System.IO.File]::WriteAllText($startupFile, $startupBody, [System.Text.Encoding]::ASCII)

$existing = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $_.CommandLine -like "*$targetDir\scanner-bridge.mjs*" -or $_.CommandLine -like "*C:\klasea\scanner\scanner-bridge.mjs*"
}
foreach ($process in @($existing)) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
$staleScans = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object {
  $_.CommandLine -like "*$targetDir\escanear-remito.ps1*" -or $_.CommandLine -like "*C:\klasea\scanner\escanear-remito.ps1*"
}
foreach ($process in @($staleScans)) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 500
Start-Process -FilePath $nodePath -ArgumentList ('"{0}"' -f (Join-Path $targetDir "scanner-bridge.mjs")) -WindowStyle Hidden

$health = $null
for ($attempt = 0; $attempt -lt 12; $attempt += 1) {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:17778/health" -TimeoutSec 2
    if ($health.ok) { break }
  } catch {
    $health = $null
  }
}
if (-not $health -or -not $health.ok) {
  throw "El puente se copio, pero no pudo iniciar en el puerto 17778. Ejecuta el acceso directo de diagnostico."
}

$systemUrl = "https://klasea-stock.vercel.app/recepcion-panol?tab=scanner"
$urlShortcut = Join-Path $desktopDir "Klase A - Escanear remitos.url"
$urlBody = "[InternetShortcut]`r`nURL=$systemUrl`r`n"
[System.IO.File]::WriteAllText($urlShortcut, $urlBody, [System.Text.Encoding]::ASCII)

$shell = New-Object -ComObject WScript.Shell
$codeShortcut = $shell.CreateShortcut((Join-Path $desktopDir "Klase A - Codigo scanner.lnk"))
$codeShortcut.TargetPath = "$env:WINDIR\System32\notepad.exe"
$codeShortcut.Arguments = ('"{0}"' -f $pairingFile)
$codeShortcut.Description = "Ver codigo de vinculacion del scanner Klase A"
$codeShortcut.Save()

$diagnosticShortcut = $shell.CreateShortcut((Join-Path $desktopDir "Klase A - Diagnostico scanner.lnk"))
$diagnosticShortcut.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$diagnosticShortcut.Arguments = ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $targetDir "diagnosticar-scanner.ps1"))
$diagnosticShortcut.Description = "Revisar Pantum, NAPS2 y puente Klase A"
$diagnosticShortcut.Save()

$pairingCode = ""
if (Test-Path -LiteralPath $pairingFile) {
  $match = Get-Content -LiteralPath $pairingFile -Raw | Select-String -Pattern '[A-F0-9]{16}' -AllMatches
  $pairingCode = $match.Matches.Value | Select-Object -First 1
}
if ($pairingCode -and (Get-Command Set-Clipboard -ErrorAction SilentlyContinue)) {
  Set-Clipboard -Value $pairingCode
}

Write-Host ""
Write-Host "Scanner Klase A instalado correctamente." -ForegroundColor Green
Write-Host "Puente local: http://127.0.0.1:17778"
Write-Host "Carpeta de remitos: $pendingDir"
Write-Host "Arranque automatico: $startupFile"
Write-Host "Accesos directos creados en el Escritorio."
if ($pairingCode) {
  Write-Host "Codigo de vinculacion: $pairingCode" -ForegroundColor Cyan
  Write-Host "El codigo tambien quedo copiado al portapapeles."
}
