param([Parameter(Mandatory=$true)][string]$ManifestPath,[Parameter(Mandatory=$true)][string]$ResultName)
$ErrorActionPreference = 'Stop'
$taskDir = $PSScriptRoot
$taskResultPath = Join-Path $taskDir $ResultName
if (Test-Path -LiteralPath $taskResultPath) { throw 'Batch already attempted; inspect its result before any retry.' }
$taskItems = @(Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json)
if ($taskItems.Count -lt 1 -or $taskItems.Count -gt 25) { throw 'Expected 1 to 25 labels.' }
$taskPrinter = Get-Printer -Name 'P1S Label Printer'
if ($taskPrinter.PrinterStatus -ne 'Normal') { throw "Printer status: $($taskPrinter.PrinterStatus)" }
if (@(Get-PrintJob -PrinterName $taskPrinter.Name).Count -gt 0) { throw 'Print queue is not empty; do not overlap batches.' }
$taskPaths = [string[]]@($taskItems | ForEach-Object { $_.bitmap })
$taskDrawingReferences = @([System.Drawing.Image].Assembly.Location, [System.Drawing.Point].Assembly.Location, [System.Drawing.Printing.PrintDocument].Assembly.Location, [System.ComponentModel.Component].Assembly.Location) + @(Get-ChildItem -LiteralPath (Split-Path -Path ([System.Drawing.Image].Assembly.Location)) -Filter 'System.Private.Windows*.dll' | Select-Object -ExpandProperty FullName)
$taskDrawingReferences = $taskDrawingReferences | Select-Object -Unique
Add-Type -ReferencedAssemblies $taskDrawingReferences -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Printing;
public static class KlaseABatchPrinter {
    public static int Print(string printerName, string[] paths, string jobName) {
        foreach (var path in paths) using (var bitmap = Image.FromFile(path)) {
            if (bitmap.Width != 320 || bitmap.Height != 240) throw new InvalidOperationException("Expected 320 x 240 bitmaps.");
        }
        using (var document = new PrintDocument()) {
            document.PrinterSettings.PrinterName = printerName;
            if (!document.PrinterSettings.IsValid) throw new InvalidOperationException("Named printer unavailable.");
            document.PrinterSettings.Copies = 1;
            PaperSize paper = null;
            foreach (PaperSize size in document.PrinterSettings.PaperSizes) if (size.PaperName == "D 40 x 30 mm") paper = size;
            if (paper == null) throw new InvalidOperationException("40 x 30 mm driver paper missing.");
            PrinterResolution resolution = null;
            foreach (PrinterResolution r in document.PrinterSettings.PrinterResolutions) if (r.X == 203 && r.Y == 203) resolution = r;
            if (resolution == null) throw new InvalidOperationException("203 dpi driver resolution missing.");
            document.DocumentName = jobName;
            document.PrintController = new StandardPrintController();
            document.OriginAtMargins = false;
            document.DefaultPageSettings.Landscape = false;
            document.DefaultPageSettings.PaperSize = paper;
            document.DefaultPageSettings.Margins = new Margins(0,0,0,0);
            document.DefaultPageSettings.PrinterResolution = resolution;
            int index = 0;
            document.PrintPage += (sender, page) => {
                using (var bitmap = Image.FromFile(paths[index])) {
                    page.Graphics.PageUnit = GraphicsUnit.Pixel;
                    page.Graphics.ResetTransform();
                    page.Graphics.TranslateTransform(-page.PageSettings.HardMarginX * 203f / 100f, -page.PageSettings.HardMarginY * 203f / 100f);
                    page.Graphics.DrawImageUnscaled(bitmap, 0, 0);
                }
                index++;
                page.HasMorePages = index < paths.Length;
            };
            document.Print();
            return index;
        }
    }
}
'@
$taskResult = [ordered]@{ Printer=$taskPrinter.Name; Codes=@($taskItems | ForEach-Object { $_.codigoEtiqueta }); CopiesEach=1; Count=$taskItems.Count; StartedAt=(Get-Date).ToString('o'); State='Started'; Success=$false }
$taskResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $taskResultPath -Encoding utf8
try {
    $taskResult.SubmittedPages = [KlaseABatchPrinter]::Print($taskPrinter.Name,$taskPaths,"KlaseA - Etiquetas 40x30 - $ResultName")
    $taskResult.Success = $taskResult.SubmittedPages -eq $taskItems.Count
    $taskResult.State = 'Submitted'
} catch { $taskResult.State = 'Error'; $taskResult.Error = $_.Exception.Message }
$taskResult.Jobs = @(Get-PrintJob -PrinterName $taskPrinter.Name -ErrorAction SilentlyContinue | Select-Object ID,DocumentName,JobStatus,TotalPages,PagesPrinted)
$taskResult.FinishedAt = (Get-Date).ToString('o')
$taskResult | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $taskResultPath -Encoding utf8
$taskResult | ConvertTo-Json -Depth 6
if (-not $taskResult.Success) { throw $taskResult.Error }
