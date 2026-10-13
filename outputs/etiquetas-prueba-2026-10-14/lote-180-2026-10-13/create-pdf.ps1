$ErrorActionPreference='Stop'
$taskDir=$PSScriptRoot
$taskChrome='C:/Program Files/Google/Chrome/Application/chrome.exe'
$taskUrl='file:///' + (Join-Path $taskDir 'etiquetas-movimientos.html').Replace('\','/')
$taskCommon=@('--headless=new','--disable-gpu',"--user-data-dir=$taskDir/chrome-profile",'--virtual-time-budget=12000','--timeout=25000','--no-pdf-header-footer')
$taskDom=Start-Process -FilePath $taskChrome -ArgumentList ($taskCommon + @('--dump-dom',$taskUrl)) -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $taskDir 'chrome-fonts-dom.html') -RedirectStandardError (Join-Path $taskDir 'chrome-fonts.log')
if ($taskDom.ExitCode -ne 0) { throw 'Browser DOM rendering failed' }
if (-not (Get-Content -LiteralPath (Join-Path $taskDir 'chrome-fonts-dom.html') -Raw).Contains('data-fonts-ready="true"')) { throw 'Fonts not loaded' }
$taskPdf=Start-Process -FilePath $taskChrome -ArgumentList ($taskCommon + @("--print-to-pdf=$taskDir/etiquetas-movimientos-chrome.pdf",$taskUrl)) -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $taskDir 'chrome-print.stdout') -RedirectStandardError (Join-Path $taskDir 'chrome-print.log')
if ($taskPdf.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $taskDir 'etiquetas-movimientos-chrome.pdf'))) { throw 'PDF generation failed' }
Get-Item -LiteralPath (Join-Path $taskDir 'etiquetas-movimientos-chrome.pdf') | Select-Object Name,Length
