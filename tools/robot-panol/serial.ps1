param([string]$Port = 'COM5')
$robotRuntime = Join-Path $PSScriptRoot 'runtime'
while (Test-Path -LiteralPath (Join-Path $robotRuntime 'serial-paused')) { Start-Sleep -Milliseconds 200 }
Add-Type -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Threading;
public static class RobotInput {
  public static readonly ConcurrentQueue<string> Lines = new ConcurrentQueue<string>();
  public static volatile bool Closed = false;
  public static void Start() {
    var thread = new Thread(() => {
      string line;
      while ((line = Console.In.ReadLine()) != null) Lines.Enqueue(line);
      Closed = true;
    });
    thread.IsBackground = true;
    thread.Start();
  }
}
'@
$robotSerial = [System.IO.Ports.SerialPort]::new($Port,115200)
try {
  $robotSerial.DtrEnable = $false
  $robotSerial.RtsEnable = $false
  $robotSerial.NewLine = "`n"
  $robotSerial.Encoding = [System.Text.Encoding]::UTF8
  $robotSerial.Open()
  [Console]::Out.WriteLine('SERIAL_READY')
  [RobotInput]::Start()
  $robotOutputBuffer = ''
  while ($true) {
    $robotLine = ''
    while ([RobotInput]::Lines.TryDequeue([ref]$robotLine)) {
      $robotSerial.WriteLine($robotLine)
    }
    if ([RobotInput]::Closed) { break }
    $robotReceived = $robotSerial.ReadExisting()
    if ($robotReceived) {
      [Console]::Out.Write($robotReceived); [Console]::Out.Flush()
      $robotOutputBuffer += $robotReceived
      while (($robotNewline = $robotOutputBuffer.IndexOf("`n")) -ge 0) {
        $robotOutputLine = $robotOutputBuffer.Substring(0,$robotNewline).Trim()
        $robotOutputBuffer = $robotOutputBuffer.Substring($robotNewline+1)
        if ($robotOutputLine.StartsWith('KLASE_NET ')) { $robotOutputLine.Substring(10) | Set-Content -LiteralPath (Join-Path $robotRuntime 'network-status.json') -Encoding UTF8 }
      if ($robotOutputLine.StartsWith('KLASE_DIAG ')) {
          $robotOutputLine.Substring(11) | Set-Content -LiteralPath (Join-Path $robotRuntime 'device-status.json') -Encoding UTF8
        }
      }
    }
    Start-Sleep -Milliseconds 25
  }
} finally {
  if ($robotSerial.IsOpen) { $robotSerial.Close() }
  $robotSerial.Dispose()
}
