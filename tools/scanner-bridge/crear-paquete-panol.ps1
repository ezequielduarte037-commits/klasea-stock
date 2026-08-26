# Con -SoloScripts arma un ZIP de kilobytes en vez de 126 MB: sirve para
# actualizar una PC que YA tiene Node, NAPS2 y el driver instalados, que es el
# caso normal despues de la primera vez. El paquete completo se necesita una
# sola vez por maquina.
param([switch]$SoloScripts)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $sourceDir "..\..")).Path
$distRoot = Join-Path $repoRoot "entregables\instalador-panol"
$packageDir = Join-Path $distRoot "KlaseA-Scanner-Panol"
$dependencyDir = Join-Path $packageDir "Dependencias"
$cacheDir = Join-Path $distRoot ".cache"
$zipPath = Join-Path $distRoot $(if ($SoloScripts) { "KlaseA-Scanner-Actualizacion.zip" } else { "KlaseA-Scanner-Panol.zip" })

if (Test-Path -LiteralPath $packageDir) { Remove-Item -LiteralPath $packageDir -Recurse -Force }
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
New-Item -ItemType Directory -Force -Path $packageDir, $dependencyDir, $cacheDir | Out-Null

$files = @(
  "scanner-bridge.mjs",
  "escanear-remito.ps1",
  "iniciar-scanner.cmd",
  "instalar-scanner.ps1",
  "instalar-panol.ps1",
  "diagnosticar-scanner.ps1",
  "REPARAR-CONEXION-SCANNER.cmd",
  "CONFIGURAR-SCANNER.cmd",
  "configurar-scanner.ps1",
  "reparar-conexion-scanner.ps1",
  "INSTALAR-EN-PANOL.cmd",
  "README-INSTALAR.txt",
  "README.md"
)
foreach ($file in $files) {
  Copy-Item -LiteralPath (Join-Path $sourceDir $file) -Destination (Join-Path $packageDir $file) -Force
}

$downloads = @(
  @{
    Name = "Node.js LTS"
    Url = "https://nodejs.org/dist/v24.19.0/node-v24.19.0-x64.msi"
    File = "node-v24.19.0-x64.msi"
    MinimumBytes = 20MB
  },
  @{
    Name = "NAPS2 8.3.2"
    Url = "https://github.com/cyanfish/naps2/releases/download/v8.3.2/naps2-8.3.2-win-x64.msi"
    File = "naps2-8.3.2-win-x64.msi"
    MinimumBytes = 30MB
  },
  @{
    Name = "Driver Pantum M6550/M6559"
    Url = "https://drivers.pantum.com/userfiles/files/download/drive/2013/Pantum%20M6200-M6500-M6550-M6600%20Series%20Windows%20Driver%20V1_14_51.exe"
    File = "Pantum-M6550-Series-Windows-Driver-V1.14.51.exe"
    MinimumBytes = 30MB
    Referer = "https://global.pantum.com/search/download-driver/?p=45&s=M6559NW"
  }
)

if ($SoloScripts) {
  Remove-Item -LiteralPath $dependencyDir -Recurse -Force -ErrorAction SilentlyContinue
  $downloads = @()
  # El instalador completo no aplica: se deja una nota para que nadie lo busque.
  $aviso = @(
    "ACTUALIZACION - solo scripts",
    "",
    "Este paquete NO trae Node.js, NAPS2 ni el driver de la Pantum: es para una",
    "PC donde ya se corrio el instalador completo alguna vez.",
    "",
    "Que hacer:",
    "  1. Copiar TODOS los archivos a C:\KlaseA\Scanner (pisando los que estan).",
    "  2. Cerrar el puente:  taskkill /F /IM node.exe",
    "  3. Doble clic en iniciar-scanner.cmd",
    "",
    "Si es una PC nueva, pedi el paquete completo (KlaseA-Scanner-Panol.zip)."
  ) -join [Environment]::NewLine
  Set-Content -LiteralPath (Join-Path $packageDir "LEEME-ACTUALIZACION.txt") -Value $aviso -Encoding UTF8
}

foreach ($download in $downloads) {
  $cachedFile = Join-Path $cacheDir $download.File
  $destination = Join-Path $dependencyDir $download.File

  if (-not (Test-Path -LiteralPath $cachedFile) -or (Get-Item -LiteralPath $cachedFile).Length -lt $download.MinimumBytes) {
    Write-Host "Descargando $($download.Name)..." -ForegroundColor Cyan
    if ($download.Referer) {
      $curl = Get-Command curl.exe -ErrorAction Stop
      & $curl.Source --location --fail --retry 2 --silent --show-error `
        --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" `
        --referer $download.Referer `
        --output $cachedFile `
        $download.Url
      if ($LASTEXITCODE -ne 0) { throw "No se pudo descargar $($download.Name)." }
    } else {
      Invoke-WebRequest -Uri $download.Url -OutFile $cachedFile -UseBasicParsing
    }
  } else {
    Write-Host "Usando copia verificada de $($download.Name)." -ForegroundColor DarkGray
  }

  if ((Get-Item -LiteralPath $cachedFile).Length -lt $download.MinimumBytes) {
    throw "La descarga de $($download.Name) quedo incompleta."
  }
  $signature = Get-AuthenticodeSignature -LiteralPath $cachedFile
  if ($signature.Status -in @("HashMismatch", "NotTrusted")) {
    throw "La firma digital de $($download.Name) no es valida: $($signature.Status)."
  }
  Copy-Item -LiteralPath $cachedFile -Destination $destination -Force
}

$checksumPath = Join-Path $packageDir "CHECKSUMS-SHA256.txt"
Get-ChildItem -LiteralPath $dependencyDir -File -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object {
  $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
  "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), $_.Name
} | Set-Content -LiteralPath $checksumPath -Encoding ASCII

if ($SoloScripts -and (Test-Path -LiteralPath $checksumPath) -and -not (Get-Content -LiteralPath $checksumPath)) {
  Remove-Item -LiteralPath $checksumPath -Force
}

Compress-Archive -LiteralPath $packageDir -DestinationPath $zipPath -CompressionLevel Optimal
$mb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
Write-Host ("Paquete listo ({0} MB):" -f $mb) -ForegroundColor Green
Write-Host $zipPath
