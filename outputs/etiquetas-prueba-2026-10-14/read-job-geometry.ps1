$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskReferences=@([System.Drawing.Image].Assembly.Location,[System.Drawing.Point].Assembly.Location,[System.ComponentModel.Component].Assembly.Location) + @(Get-ChildItem -LiteralPath (Split-Path -Path ([System.Drawing.Image].Assembly.Location)) -Filter 'System.Private.Windows*.dll' | Select-Object -ExpandProperty FullName)
Add-Type -ReferencedAssemblies ($taskReferences | Select-Object -Unique) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Printing;
using System.Runtime.InteropServices;
public static class KlaseAPrintGeometry {
 [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr h);
 [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);
 [DllImport("kernel32.dll")] static extern IntPtr GlobalFree(IntPtr h);
 [DllImport("gdi32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateDC(string driver,string device,string output,IntPtr mode);
 [DllImport("gdi32.dll")] static extern int GetDeviceCaps(IntPtr dc,int index);
 [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
 public static string Diagnose(string printerName) {
  var printer=new PrinterSettings();printer.PrinterName=printerName;
  var page=new PageSettings(printer);
  foreach(PaperSize p in printer.PaperSizes)if(p.PaperName=="D 40 x 30 mm")page.PaperSize=p;
  foreach(PrinterResolution r in printer.PrinterResolutions)if(r.X==203&&r.Y==203)page.PrinterResolution=r;
  page.Margins=new Margins(0,0,0,0);page.Landscape=false;
  IntPtr h=printer.GetHdevmode(page),ptr=GlobalLock(h),dc=IntPtr.Zero;
  try {
   int originalPaper=Marshal.ReadInt16(ptr,78);
   Marshal.WriteInt16(ptr,78,172);
   Marshal.WriteInt16(ptr,80,300);
   Marshal.WriteInt16(ptr,82,400);
   Marshal.WriteInt32(ptr,72,Marshal.ReadInt32(ptr,72)|0x0001000E);
   byte[] form=System.Text.Encoding.Unicode.GetBytes("D 40 x 30 mm".PadRight(32,'\0'));
   Marshal.Copy(form,0,IntPtr.Add(ptr,102),form.Length);
   printer.SetHdevmode(h);page.SetHdevmode(h);
   GlobalUnlock(h);GlobalFree(h);
   h=printer.GetHdevmode(page);ptr=GlobalLock(h);
   dc=CreateDC("WINSPOOL",printerName,null,ptr);if(dc==IntPtr.Zero)throw new InvalidOperationException("CreateDC failed");
   using(var graphics=Graphics.FromHdc(dc)) {
    string initial="Graphics DPI="+graphics.DpiX+"x"+graphics.DpiY+"; Unit="+graphics.PageUnit+"; Scale="+graphics.PageScale;
    graphics.PageUnit=GraphicsUnit.Pixel;graphics.ResetTransform();
    return "Original DEVMODE paper="+originalPaper+"; Requested paper="+page.PaperSize.PaperName+"; RawKind="+page.PaperSize.RawKind+"; PageBounds="+page.Bounds+"; Corrected DEVMODE paper="+Marshal.ReadInt16(ptr,78)+"; PaperLengthTenthMm="+Marshal.ReadInt16(ptr,80)+"; PaperWidthTenthMm="+Marshal.ReadInt16(ptr,82)+"; Device printable="+GetDeviceCaps(dc,8)+"x"+GetDeviceCaps(dc,10)+"; Device physical="+GetDeviceCaps(dc,110)+"x"+GetDeviceCaps(dc,111)+"; Device DPI="+GetDeviceCaps(dc,88)+"x"+GetDeviceCaps(dc,90)+"; Device origin="+GetDeviceCaps(dc,112)+","+GetDeviceCaps(dc,113)+"; "+initial+"; Pixel Unit Scale="+graphics.PageScale;
   }
  }finally{if(dc!=IntPtr.Zero)DeleteDC(dc);GlobalUnlock(h);GlobalFree(h);}
 }
}
'@
$taskDiagnosis=[KlaseAPrintGeometry]::Diagnose('P1S Label Printer')
$taskDiagnosis | Tee-Object -FilePath 'C:/klasea-stock/outputs/etiquetas-prueba-2026-10-14/job-geometry-corrected.txt'
