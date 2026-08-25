param(
  [Parameter(Mandatory = $false)]
  [string]$Destination = "C:\KlaseA\Remitos\Pendientes"
)

$ErrorActionPreference = "Stop"
$jpegFormat = "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}"
$errorFile = Join-Path $env:LOCALAPPDATA "KlaseA\Scanner\ultimo-error.txt"

try {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  New-Item -ItemType Directory -Path (Split-Path -Parent $errorFile) -Force | Out-Null

  $manager = New-Object -ComObject WIA.DeviceManager
  $scanners = @($manager.DeviceInfos) | Where-Object { [int]$_.Type -eq 1 }
  $pantum = $scanners | Where-Object {
    $name = $_.Properties | Where-Object { $_.Name -eq "Name" } | Select-Object -ExpandProperty Value -ErrorAction SilentlyContinue
    $name -match "Pantum|M655"
  } | Select-Object -First 1

  if (-not $pantum) {
    throw "Windows no encuentra la Pantum como escaner. Revisa el cable USB y el controlador de escaneo."
  }

  $device = $pantum.Connect()
  $flatbed = $device.Properties | Where-Object { $_.PropertyID -eq 3088 } | Select-Object -First 1
  if ($flatbed -and -not $flatbed.IsReadOnly) {
    $flatbed.Value = 2
  }

  $pages = $device.Properties | Where-Object { $_.PropertyID -eq 3096 } | Select-Object -First 1
  if ($pages -and -not $pages.IsReadOnly) {
    $pages.Value = 1
  }

  $item = $device.Items.Item(1)
  foreach ($propertyId in 6147, 6148) {
    $resolution = $item.Properties | Where-Object { $_.PropertyID -eq $propertyId } | Select-Object -First 1
    if ($resolution -and -not $resolution.IsReadOnly) {
      $resolution.Value = 300
    }
  }

  $image = $item.Transfer($jpegFormat)
  if ($null -eq $image) {
    exit 0
  }

  if ($image.FormatID -ne $jpegFormat) {
    $processor = New-Object -ComObject WIA.ImageProcess
    $processor.Filters.Add($processor.FilterInfos.Item("Convert").FilterID)
    $processor.Filters.Item(1).Properties.Item("FormatID").Value = $jpegFormat
    $image = $processor.Apply($image)
  }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
  $output = Join-Path $Destination "remito-$stamp.jpg"
  $image.SaveFile($output)
  Remove-Item -LiteralPath $errorFile -Force -ErrorAction SilentlyContinue
} catch {
  $message = $_.Exception.Message
  [System.IO.File]::WriteAllText($errorFile, $message, [System.Text.Encoding]::UTF8)
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    $message,
    "Klase A - Escaner de remitos",
    [System.Windows.MessageBoxButton]::OK,
    [System.Windows.MessageBoxImage]::Error
  ) | Out-Null
  exit 1
}
