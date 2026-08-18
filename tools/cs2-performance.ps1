$ErrorActionPreference = 'SilentlyContinue'

# Launcher reversible para jugar CS2 con el menor ruido de fondo posible.
# No cambia servicios, seguridad, BIOS ni drivers.
$steamExe = 'C:\Program Files (x86)\Steam\steam.exe'

# Cierra aplicaciones de usuario pesadas; Windows y los servicios ASUS/NVIDIA quedan intactos.
$appsToClose = @(
  'chrome',
  'msedge',
  'OneDrive',
  'WhatsApp',
  'WhatsApp.Root',
  'Teams',
  'ms-teams',
  'claude',
  'ChatGPT',
  'NVIDIA Overlay'
)

foreach ($app in $appsToClose) {
  Get-Process -Name $app -ErrorAction SilentlyContinue | Stop-Process -Force
}

# Reafirma el perfil ASUS Turbo ya configurado en esta notebook.
powercfg /setactive 6fecc5ae-f350-48a5-b669-b472cb895ccf | Out-Null

# NVIDIA documenta que Reflex + Boost puede bajar levemente los FPS. Para el
# objetivo de superar 240 FPS usamos Reflex On (1), no On + Boost (2).
$videoConfig = 'C:\Program Files (x86)\Steam\userdata\1883342233\730\local\cfg\cs2_video.txt'
if (Test-Path $videoConfig) {
  $videoText = Get-Content -LiteralPath $videoConfig -Raw
  $videoText = $videoText -replace '"setting\.r_low_latency"\s+"2"', '"setting.r_low_latency"`t`t"1"'
  Set-Content -LiteralPath $videoConfig -Value $videoText -Encoding UTF8
}

if (-not (Test-Path $steamExe)) {
  Write-Error "No se encontro Steam en $steamExe"
  exit 1
}

Start-Process $steamExe -ArgumentList '-applaunch 730' 

# Espera a CS2 y eleva su prioridad sin usar Realtime (inestable y contraproducente).
$deadline = (Get-Date).AddMinutes(2)
do {
  Start-Sleep -Milliseconds 500
  $cs2 = Get-Process -Name cs2 -ErrorAction SilentlyContinue
} until ($cs2 -or (Get-Date) -gt $deadline)

if ($cs2) {
  $cs2.PriorityClass = 'High'
  Write-Host 'CS2 iniciado con perfil Turbo y prioridad High.' -ForegroundColor Green
} else {
  Write-Warning 'CS2 no aparecio dentro de 2 minutos.'
}
