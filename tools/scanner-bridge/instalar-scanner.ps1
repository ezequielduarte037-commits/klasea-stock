$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetDir = "C:\klasea\scanner"
$pendingDir = "C:\KlaseA\Remitos\Pendientes"
$processedDir = "C:\KlaseA\Remitos\Procesados"
$scanErrorFile = Join-Path $env:LOCALAPPDATA "KlaseA\Scanner\ultimo-error.txt"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupFile = Join-Path $startupDir "KlaseA Scanner.cmd"

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw "Node.js no esta instalado o no figura en PATH."
}

New-Item -ItemType Directory -Force -Path $targetDir, $pendingDir, $processedDir | Out-Null
Remove-Item -LiteralPath $scanErrorFile -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath (Join-Path $sourceDir "scanner-bridge.mjs") -Destination (Join-Path $targetDir "scanner-bridge.mjs") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "iniciar-scanner.cmd") -Destination (Join-Path $targetDir "iniciar-scanner.cmd") -Force
Copy-Item -LiteralPath (Join-Path $sourceDir "escanear-remito.ps1") -Destination (Join-Path $targetDir "escanear-remito.ps1") -Force

$startupBody = "@echo off`r`nstart `"KlaseA Scanner`" /MIN node `"C:\klasea\scanner\scanner-bridge.mjs`"`r`n"
[System.IO.File]::WriteAllText($startupFile, $startupBody, [System.Text.Encoding]::ASCII)

$existing = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $_.CommandLine -like "*C:\klasea\scanner\scanner-bridge.mjs*"
}
foreach ($process in @($existing)) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
$staleScans = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object {
  $_.CommandLine -like "*C:\klasea\scanner\escanear-remito.ps1*"
}
foreach ($process in @($staleScans)) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 400
Start-Process -FilePath "node.exe" -ArgumentList '"C:\klasea\scanner\scanner-bridge.mjs"' -WindowStyle Hidden

Write-Host "Scanner KlaseA instalado." -ForegroundColor Green
Write-Host "Carpeta de remitos: $pendingDir"
Write-Host "Arranque automatico: $startupFile"
