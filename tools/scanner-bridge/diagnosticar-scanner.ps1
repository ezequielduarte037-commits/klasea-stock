param(
  [switch]$NoPause
)

$ErrorActionPreference = "Continue"
$configDir = Join-Path $env:LOCALAPPDATA "KlaseA\Scanner"
$pairingFile = Join-Path $configDir "codigo-vinculacion.txt"
$errorFile = Join-Path $configDir "ultimo-error.txt"
$checks = New-Object System.Collections.Generic.List[object]

function Add-Check([string]$Name, [bool]$Ok, [string]$Detail) {
  $checks.Add([pscustomobject]@{ Componente = $Name; Estado = if ($Ok) { "OK" } else { "REVISAR" }; Detalle = $Detail })
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
Add-Check "Node.js" ([bool]$node) $(if ($node) { & $node.Source --version } else { "No instalado" })

$naps2 = "C:\Program Files\NAPS2\NAPS2.Console.exe"
Add-Check "NAPS2" (Test-Path -LiteralPath $naps2) $(if (Test-Path -LiteralPath $naps2) { $naps2 } else { "No instalado" })

$deviceNames = @()
try {
  $manager = New-Object -ComObject WIA.DeviceManager
  $deviceNames = @($manager.DeviceInfos) | Where-Object { [int]$_.Type -eq 1 } | ForEach-Object {
    ($_.Properties | Where-Object { $_.Name -eq "Name" } | Select-Object -ExpandProperty Value -ErrorAction SilentlyContinue)
  } | Where-Object { $_ }
} catch {
  $deviceNames = @()
}
$pantum = @($deviceNames | Where-Object { $_ -match "Pantum|M655" })
Add-Check "Scanner Pantum" ($pantum.Count -gt 0) $(if ($pantum.Count) { $pantum -join ", " } else { "Windows no lo ve por WIA/TWAIN" })

$health = $null
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:17778/health" -TimeoutSec 3
} catch {
  $health = $null
}
Add-Check "Puente Klase A" ([bool]$health.ok) $(if ($health.ok) { "Version $($health.version) - $($health.folder)" } else { "No responde en 127.0.0.1:17778" })
Add-Check "Carpeta Pendientes" (Test-Path -LiteralPath "C:\KlaseA\Remitos\Pendientes") "C:\KlaseA\Remitos\Pendientes"
Add-Check "Inicio automatico" (Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath("Startup")) "KlaseA Scanner.cmd")) "Usuario actual"

Clear-Host
Write-Host "KLASE A - DIAGNOSTICO DEL SCANNER" -ForegroundColor Cyan
Write-Host "================================="
$checks | Format-Table -AutoSize

if (Test-Path -LiteralPath $pairingFile) {
  Write-Host "Codigo de vinculacion:" -ForegroundColor Yellow
  Get-Content -LiteralPath $pairingFile
}
if (Test-Path -LiteralPath $errorFile) {
  Write-Host "Ultimo error:" -ForegroundColor Red
  Get-Content -LiteralPath $errorFile
}

$failed = @($checks | Where-Object { $_.Estado -ne "OK" }).Count
if ($failed -eq 0) {
  Write-Host "Todo listo para escanear desde Klase A." -ForegroundColor Green
} else {
  Write-Host "$failed componente(s) requieren revision." -ForegroundColor Yellow
}

if (-not $NoPause) {
  [void](Read-Host "Presiona Enter para cerrar")
}
if ($failed -gt 0) { exit 1 }
