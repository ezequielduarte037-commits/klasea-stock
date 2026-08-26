param(
  [Parameter(Mandatory = $false)]
  [string]$Destination = "C:\KlaseA\Remitos\Pendientes",

  [Parameter(Mandatory = $false)]
  [ValidateSet("feeder", "glass")]
  [string]$Source = "glass"
)

$ErrorActionPreference = "Stop"
$jpegFormat = "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}"
$errorFile = Join-Path $env:LOCALAPPDATA "KlaseA\Scanner\ultimo-error.txt"

try {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  New-Item -ItemType Directory -Path (Split-Path -Parent $errorFile) -Force | Out-Null

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
  $naps2 = "C:\Program Files\NAPS2\NAPS2.Console.exe"
  if (Test-Path -LiteralPath $naps2) {
    $output = Join-Path $Destination "remito-$stamp.pdf"

    # El modelo venia escrito a mano como "Pantum M6550" y el equipo del panol es
    # una M6559NW: NAPS2 no encontraba ningun dispositivo con ese nombre. Se le
    # pregunta a Windows como se llama de verdad en esta PC.
    $nombreEquipo = $null
    try {
      $manager = New-Object -ComObject WIA.DeviceManager
      $nombres = @($manager.DeviceInfos) | Where-Object { [int]$_.Type -eq 1 } | ForEach-Object {
        $_.Properties | Where-Object { $_.Name -eq "Name" } | Select-Object -ExpandProperty Value -ErrorAction SilentlyContinue
      }
      $nombreEquipo = @($nombres | Where-Object { $_ -match "Pantum|M65" }) | Select-Object -First 1
      if (-not $nombreEquipo) { $nombreEquipo = @($nombres) | Select-Object -First 1 }
    } catch {
      $nombreEquipo = $null
    }

    $argumentos = @("--output", $output, "--noprofile", "--driver", "twain")
    if ($nombreEquipo) { $argumentos += @("--device", $nombreEquipo) }
    $argumentos += @(
      "--source", $Source,
      "--dpi", "300",
      "--pagesize", "a4",
      "--bitdepth", "color",
      "--deskew",
      "--progress"
    )
    & $naps2 @argumentos

    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output)) {
      throw "NAPS2 no pudo obtener la imagen desde la Pantum. Revisa el origen elegido y que haya papel."
    }
    Remove-Item -LiteralPath $errorFile -Force -ErrorAction SilentlyContinue
    exit 0
  }

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
  $wiaSource = $device.Properties | Where-Object { $_.PropertyID -eq 3088 } | Select-Object -First 1
  if ($wiaSource -and -not $wiaSource.IsReadOnly) {
    $wiaSource.Value = if ($Source -eq "feeder") { 1 } else { 2 }
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

  # El controlador Pantum queda esperando indefinidamente cuando se usa
  # Item.Transfer() sin interfaz. CommonDialog mantiene seleccionado este
  # dispositivo, muestra el progreso oficial de WIA y devuelve la imagen al
  # terminar, sin pedirle al usuario que elija nuevamente el scanner.
  $preferredFormat = $item.Formats.Item(1)
  $dialog = New-Object -ComObject WIA.CommonDialog
  $image = $dialog.ShowTransfer($item, $preferredFormat, $false)
  if ($null -eq $image) {
    throw "La Pantum no devolvio una imagen. Revisa que este encendida y disponible."
  }

  if ($image.FormatID -ne $jpegFormat) {
    $processor = New-Object -ComObject WIA.ImageProcess
    $processor.Filters.Add($processor.FilterInfos.Item("Convert").FilterID)
    $processor.Filters.Item(1).Properties.Item("FormatID").Value = $jpegFormat
    $image = $processor.Apply($image)
  }

  $output = Join-Path $Destination "remito-$stamp.jpg"
  $image.SaveFile($output)
  Remove-Item -LiteralPath $errorFile -Force -ErrorAction SilentlyContinue
} catch {
  $message = $_.Exception.Message
  [System.IO.File]::WriteAllText($errorFile, $message, [System.Text.Encoding]::UTF8)
  exit 1
}
