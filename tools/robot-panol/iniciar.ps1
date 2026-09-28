$robotRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$robotNode = (Get-Command node -ErrorAction Stop).Source
$robotLog = Join-Path $PSScriptRoot 'runtime'
New-Item -ItemType Directory -Path $robotLog -Force | Out-Null
if (Get-NetTCPConnection -LocalPort 4188 -State Listen -ErrorAction SilentlyContinue) {
  Write-Output 'El puente ya esta abierto: http://127.0.0.1:4188'
  exit
}
$robotProcess = Start-Process -FilePath $robotNode -ArgumentList 'tools/robot-panol/bridge.mjs' -WorkingDirectory $robotRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $robotLog 'bridge.log') -RedirectStandardError (Join-Path $robotLog 'bridge-error.log')
$robotProcess.Id | Set-Content -LiteralPath (Join-Path $robotLog 'bridge.pid')
Write-Output "Puente iniciado (PID $($robotProcess.Id)): http://127.0.0.1:4188"
