$ErrorActionPreference='Stop'
$taskDir=$PSScriptRoot
$taskShell=(Get-Process -Id $PID).Path
$taskBatches=@(Get-ChildItem -LiteralPath $taskDir -Filter 'batch-*.json' | Sort-Object Name)
foreach ($taskBatch in $taskBatches) {
    $taskResultName=$taskBatch.BaseName+'-print-result.json'
    & $taskShell -NoProfile -File (Join-Path $taskDir 'print-batch.ps1') -ManifestPath $taskBatch.FullName -ResultName $taskResultName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Submission failed for $($taskBatch.Name); inspect result before retrying." }
    $taskResult=Get-Content -LiteralPath (Join-Path $taskDir $taskResultName) -Raw | ConvertFrom-Json
    if (-not $taskResult.Success) { throw "Submission not confirmed for $($taskBatch.Name)." }
    $taskDeadline=(Get-Date).AddSeconds(60)
    do {
        $taskPrinter=Get-Printer -Name 'P1S Label Printer'
        if ($taskPrinter.PrinterStatus -ne 'Normal') { throw "Printer needs attention: $($taskPrinter.PrinterStatus)" }
        $taskJobs=@(Get-PrintJob -PrinterName $taskPrinter.Name)
        if ($taskJobs.Count -eq 0) { break }
        if ((Get-Date) -gt $taskDeadline) { throw "Queue did not clear after $($taskBatch.Name); inspect printer before continuing." }
        Start-Sleep -Seconds 3
    } while ($true)
    [pscustomobject]@{Batch=$taskBatch.BaseName;Submitted=$taskResult.SubmittedPages;Queue='Empty';FirstCode=$taskResult.Codes[0];LastCode=$taskResult.Codes[-1]} | ConvertTo-Json -Compress
}
$taskResults=@(Get-ChildItem -LiteralPath $taskDir -Filter '*print-result.json' | ForEach-Object {Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json})
$taskFinal=[ordered]@{Printer='P1S Label Printer';Submitted=($taskResults | Measure-Object -Property SubmittedPages -Sum).Sum;AllSubmissionsSuccessful=@($taskResults | Where-Object {-not $_.Success}).Count -eq 0;JobCount=@(Get-PrintJob -PrinterName 'P1S Label Printer').Count;PrinterStatus=(Get-Printer -Name 'P1S Label Printer').PrinterStatus.ToString();CompletedAt=(Get-Date).ToString('o')}
$taskFinal | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskDir 'final-status.json') -Encoding utf8
$taskFinal | ConvertTo-Json -Compress
