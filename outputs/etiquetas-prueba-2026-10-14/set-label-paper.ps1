$ErrorActionPreference='Stop'
$taskDir='C:/klasea-stock/outputs/etiquetas-prueba-2026-10-14'
$taskPrinterName='P1S Label Printer'
$taskBefore=Get-PrintConfiguration -PrinterName $taskPrinterName
$taskBefore.PrintTicketXml | Set-Content -LiteralPath (Join-Path $taskDir 'paper-preferences-before.xml') -Encoding UTF8
$taskTicket=[xml]$taskBefore.PrintTicketXml
$taskMedia=$taskTicket.SelectSingleNode("//*[local-name()='Feature' and @name='psk:PageMediaSize']")
if (-not $taskMedia) {throw 'PageMediaSize is missing from driver ticket'}
$taskOption=$taskMedia.SelectSingleNode("*[local-name()='Option']")
$taskOption.SetAttribute('name','ns0000:Option10')
$taskOption.SelectSingleNode("*[local-name()='ScoredProperty' and @name='psk:MediaSizeWidth']/*[local-name()='Value']").InnerText='40039'
$taskOption.SelectSingleNode("*[local-name()='ScoredProperty' and @name='psk:MediaSizeHeight']/*[local-name()='Value']").InnerText='30030'
$taskTicket.OuterXml | Set-Content -LiteralPath (Join-Path $taskDir 'paper-preferences-requested.xml') -Encoding UTF8
Set-PrintConfiguration -PrinterName $taskPrinterName -PrintTicketXml $taskTicket.OuterXml
Add-Type -AssemblyName System.Drawing
$taskSettings=New-Object System.Drawing.Printing.PrinterSettings
$taskSettings.PrinterName=$taskPrinterName
$taskAfter=Get-PrintConfiguration -PrinterName $taskPrinterName
$taskAfter.PrintTicketXml | Set-Content -LiteralPath (Join-Path $taskDir 'paper-preferences-after.xml') -Encoding UTF8
$taskResult=[pscustomobject]@{ Printer=$taskPrinterName; PaperName=$taskSettings.DefaultPageSettings.PaperSize.PaperName; Width=$taskSettings.DefaultPageSettings.PaperSize.Width; Height=$taskSettings.DefaultPageSettings.PaperSize.Height; RawKind=$taskSettings.DefaultPageSettings.PaperSize.RawKind; Dpi=$taskSettings.DefaultPageSettings.PrinterResolution.X }
$taskResult | ConvertTo-Json | Tee-Object -FilePath (Join-Path $taskDir 'paper-preferences-result.json')
if ($taskResult.PaperName -ne 'D 40 x 30 mm') {throw 'Driver did not apply the requested 40 x 30 preset'}
