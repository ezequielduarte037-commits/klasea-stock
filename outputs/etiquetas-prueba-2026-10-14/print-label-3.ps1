$ErrorActionPreference = 'Stop'
$taskDir = 'C:/klasea-stock/outputs/etiquetas-prueba-2026-10-14'
$taskResultPath = Join-Path $taskDir 'remaining-3-print-result.json'
if (Test-Path -LiteralPath $taskResultPath) { throw 'First print already attempted; inspect the saved result before retrying.' }
$taskPrinterName = 'P1S Label Printer'
$taskBeforeDefault = @(Get-CimInstance Win32_Printer | Where-Object Default | Select-Object -ExpandProperty Name)
Add-Type -AssemblyName System.Drawing
$taskDrawingReferences = @([System.Drawing.Image].Assembly.Location, [System.Drawing.Point].Assembly.Location, [System.Drawing.Printing.PrintDocument].Assembly.Location, [System.ComponentModel.Component].Assembly.Location) + @(Get-ChildItem -LiteralPath (Split-Path -Path ([System.Drawing.Image].Assembly.Location)) -Filter 'System.Private.Windows*.dll' | Select-Object -ExpandProperty FullName)
$taskDrawingReferences = $taskDrawingReferences | Select-Object -Unique
Add-Type -ReferencedAssemblies $taskDrawingReferences -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Printing;
public static class KlaseALabelPrinter3 {
    public static string PrintOne(string printerName, string bitmapPath) {
        using (var bitmap = Image.FromFile(bitmapPath))
        using (var document = new PrintDocument()) {
            if (bitmap.Width != 320 || bitmap.Height != 240) throw new InvalidOperationException("Expected a 320 x 240 bitmap.");
            document.PrinterSettings.PrinterName = printerName;
            if (!document.PrinterSettings.IsValid) throw new InvalidOperationException("Named printer is not available.");
            document.PrinterSettings.Copies = 1;
            PaperSize paper = null;
            foreach (PaperSize size in document.PrinterSettings.PaperSizes) if (size.PaperName == "D 40 x 30 mm") paper = size;
            if (paper == null) throw new InvalidOperationException("Driver's 40 x 30 mm paper is missing.");
            PrinterResolution resolution = null;
            foreach (PrinterResolution r in document.PrinterSettings.PrinterResolutions) if (r.X == 203 && r.Y == 203) resolution = r;
            if (resolution == null) throw new InvalidOperationException("Driver's 203 dpi resolution is missing.");
            document.DocumentName = "KlaseA - Prueba 3 de 5 - L0019";
            document.PrintController = new StandardPrintController();
            document.OriginAtMargins = false;
            document.DefaultPageSettings.Landscape = false;
            document.DefaultPageSettings.PaperSize = paper;
            document.DefaultPageSettings.Margins = new Margins(0,0,0,0);
            document.DefaultPageSettings.PrinterResolution = resolution;
            document.PrintPage += (sender, page) => {
                page.Graphics.PageUnit = GraphicsUnit.Pixel;
                page.Graphics.ResetTransform();
                page.Graphics.TranslateTransform(-page.PageSettings.HardMarginX * 203f / 100f, -page.PageSettings.HardMarginY * 203f / 100f);
                page.Graphics.DrawImageUnscaled(bitmap, 0, 0);
                page.HasMorePages = false;
            };
            document.Print();
            return "One page submitted via Windows PrintDocument; 203 dpi, 320 x 240 bitmap, driver paper D 40 x 30 mm, zero margins, no image scaling.";
        }
    }
}
'@
$taskResult = [ordered]@{ Printer=$taskPrinterName; Code='L0019'; Copies=1; StartedAt=(Get-Date).ToString('o'); Success=$false }
try {
    $taskResult.Message = [KlaseALabelPrinter3]::PrintOne($taskPrinterName,(Join-Path $taskDir 'etiqueta-3.png'))
    $taskResult.Success = $true
} catch { $taskResult.Error = $_.Exception.Message }
$taskResult.DefaultBefore = $taskBeforeDefault
$taskResult.DefaultAfter = @(Get-CimInstance Win32_Printer | Where-Object Default | Select-Object -ExpandProperty Name)
$taskResult.Jobs = @(Get-PrintJob -PrinterName $taskPrinterName -ErrorAction SilentlyContinue | Select-Object ID,DocumentName,JobStatus,TotalPages,PagesPrinted)
$taskResult.FinishedAt = (Get-Date).ToString('o')
$taskResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $taskResultPath -Encoding UTF8
$taskResult | ConvertTo-Json -Depth 6
if (-not $taskResult.Success) { throw $taskResult.Error }

