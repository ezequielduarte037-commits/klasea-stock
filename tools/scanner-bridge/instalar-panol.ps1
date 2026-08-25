$ErrorActionPreference = "Stop"

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dependencyDir = Join-Path $sourceDir "Dependencias"
$nodeInstaller = Join-Path $dependencyDir "node-v24.19.0-x64.msi"
$napsInstaller = Join-Path $dependencyDir "naps2-8.3.2-win-x64.msi"
$pantumInstaller = Join-Path $dependencyDir "Pantum-M6550-Series-Windows-Driver-V1.14.51.exe"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ejecuta INSTALAR-EN-PANOL.cmd; ese archivo solicita permisos de administrador automaticamente."
  }
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Install-Msi([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "Falta $Name en la carpeta Dependencias." }
  Write-Host "Instalando $Name..." -ForegroundColor Cyan
  $process = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", ('"{0}"' -f $Path), "/qn", "/norestart") -Wait -PassThru
  if ($process.ExitCode -notin 0, 3010) { throw "$Name devolvio el codigo $($process.ExitCode)." }
}

function Get-PantumScannerNames {
  try {
    $manager = New-Object -ComObject WIA.DeviceManager
    return @($manager.DeviceInfos) | Where-Object { [int]$_.Type -eq 1 } | ForEach-Object {
      ($_.Properties | Where-Object { $_.Name -eq "Name" } | Select-Object -ExpandProperty Value -ErrorAction SilentlyContinue)
    } | Where-Object { $_ -match "Pantum|M655" }
  } catch {
    return @()
  }
}

Assert-Administrator
Write-Host "KLASE A - INSTALACION DEL SCANNER DE PANOL" -ForegroundColor Cyan
Write-Host "Conecta la Pantum por USB, encendela y deja papel fuera del equipo por ahora."
Write-Host ""

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath "C:\Program Files\nodejs\node.exe")) {
  Install-Msi $nodeInstaller "Node.js LTS"
  Refresh-Path
} else {
  Write-Host "Node.js ya esta instalado." -ForegroundColor Green
}

if (-not (Test-Path -LiteralPath "C:\Program Files\NAPS2\NAPS2.Console.exe")) {
  Install-Msi $napsInstaller "NAPS2"
} else {
  Write-Host "NAPS2 ya esta instalado." -ForegroundColor Green
}

$pantumNames = @(Get-PantumScannerNames)
if ($pantumNames.Count -eq 0) {
  if (-not (Test-Path -LiteralPath $pantumInstaller)) {
    throw "Windows no detecta la Pantum y falta el instalador oficial del driver."
  }
  Write-Host "Windows todavia no detecta el scanner. Se abrira el instalador oficial de Pantum." -ForegroundColor Yellow
  Write-Host "Elegi instalacion por USB y completa el asistente."
  [void](Start-Process -FilePath $pantumInstaller -Wait -PassThru)
  Start-Sleep -Seconds 2
  $pantumNames = @(Get-PantumScannerNames)
  if ($pantumNames.Count -eq 0) {
    Write-Host "El puente se instalara igual, pero Windows todavia no muestra el scanner Pantum." -ForegroundColor Yellow
    Write-Host "Reinicia la PC y ejecuta el acceso directo 'Klase A - Diagnostico scanner'."
  }
} else {
  Write-Host "Scanner detectado: $($pantumNames -join ', ')" -ForegroundColor Green
}

& (Join-Path $sourceDir "instalar-scanner.ps1")
& (Join-Path $sourceDir "diagnosticar-scanner.ps1") -NoPause

Write-Host ""
Write-Host "INSTALACION TERMINADA" -ForegroundColor Green
Write-Host "1. Abri 'Klase A - Escanear remitos' desde el Escritorio."
Write-Host "2. Abri 'Klase A - Codigo scanner' y pega el codigo en Vincular."
Write-Host "3. La vinculacion se hace una sola vez en este navegador."
