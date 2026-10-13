$ErrorActionPreference = 'Stop'
$taskDir = 'C:/klasea-stock/outputs/etiquetas-prueba-2026-10-14'
$taskResult = [ordered]@{ StartedAt=(Get-Date).ToString('o'); Success=$false }
try {
    $taskInitialDefault = @(Get-CimInstance Win32_Printer | Where-Object Default | Select-Object -ExpandProperty Name)
    $taskInf = Join-Path $taskDir 'driver-package/Win7/P1.inf'
    $taskPnPLog = & pnputil.exe /add-driver $taskInf /install 2>&1
    $taskPnPCode = $LASTEXITCODE
    $taskPnPLog | Out-File -LiteralPath (Join-Path $taskDir 'driver-install.log') -Encoding utf8
    if ($taskPnPCode -notin @(0,3010)) { throw "Driver installation returned code $taskPnPCode" }
    $taskCatalogHash = (Get-FileHash -LiteralPath (Join-Path $taskDir 'driver-package/Win7/P1.cat')).Hash
    $taskDriverFolders = @(Get-ChildItem -LiteralPath 'C:/Windows/System32/DriverStore/FileRepository' -Directory -Filter 'p1.inf_*' | Where-Object {
        $taskCatalog = Join-Path $_.FullName 'P1.cat'
        (Test-Path -LiteralPath $taskCatalog) -and ((Get-FileHash -LiteralPath $taskCatalog).Hash -eq $taskCatalogHash)
    })
    if ($taskDriverFolders.Count -ne 1) { throw 'Could not identify the matching installed P1 driver package' }
    if (-not (Get-PrinterDriver -Name 'P1 Label Printer' -ErrorAction SilentlyContinue)) {
        Add-PrinterDriver -Name 'P1 Label Printer' -InfPath (Join-Path $taskDriverFolders[0].FullName 'P1.inf')
    }
    $taskUsbPorts = @(Get-ChildItem -LiteralPath 'HKLM:/SYSTEM/CurrentControlSet/Control/Print/Monitors/USB Monitor/Ports' | Where-Object {
        (Get-ItemProperty -LiteralPath $_.PSPath).'Device Id' -like 'USB\VID_3533&PID_5A11&MI_00\*'
    })
    if ($taskUsbPorts.Count -ne 1) { throw 'Could not identify exactly one P1 USB printer port' }
    $taskPortName = $taskUsbPorts[0].PSChildName
    if (-not (Get-Printer -Name 'P1 Label Printer' -ErrorAction SilentlyContinue)) {
        Add-Printer -Name 'P1 Label Printer' -DriverName 'P1 Label Printer' -PortName $taskPortName
    }
    $taskResult.Printer = Get-Printer -Name 'P1 Label Printer' | Select-Object Name,DriverName,PortName,PrinterStatus
    $taskResult.Driver = Get-PrinterDriver -Name 'P1 Label Printer' | Select-Object Name,Manufacturer,InfPath,DriverVersion
    $taskResult.DefaultBefore = $taskInitialDefault
    $taskResult.DefaultAfter = @(Get-CimInstance Win32_Printer | Where-Object Default | Select-Object -ExpandProperty Name)
    $taskResult.Success = $true
} catch {
    $taskResult.Error = $_.Exception.Message
} finally {
    $taskResult.EndedAt = (Get-Date).ToString('o')
    $taskResult | ConvertTo-Json -Depth 6 | Out-File -LiteralPath (Join-Path $taskDir 'driver-install-result.json') -Encoding utf8
}
