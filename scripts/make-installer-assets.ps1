Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logoPath = Join-Path $root 'src\assets\logo.png'
$fontPath = Join-Path $root 'src\assets\fonts\minecraft-ten.ttf'
$outDir = Join-Path $root 'src-tauri\installer'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$bg = [System.Drawing.Color]::FromArgb(11, 14, 8)
$panel = [System.Drawing.Color]::FromArgb(15, 20, 12)
$acid = [System.Drawing.Color]::FromArgb(198, 249, 94)
$acidDim = [System.Drawing.Color]::FromArgb(133, 172, 70)
$cream = [System.Drawing.Color]::FromArgb(239, 233, 210)
$muted = [System.Drawing.Color]::FromArgb(116, 122, 95)
$line = [System.Drawing.Color]::FromArgb(41, 50, 33)

$fonts = New-Object System.Drawing.Text.PrivateFontCollection
$fonts.AddFontFile($fontPath)
$pixel = $fonts.Families[0]
$logo = [System.Drawing.Image]::FromFile($logoPath)

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit
  return @($bmp, $g)
}

function Draw-Grid($g, [int]$w, [int]$h) {
  $pen = New-Object System.Drawing.Pen $line, 1
  for ($x = 0; $x -lt $w; $x += 16) { $g.DrawLine($pen, $x, 0, $x, $h) }
  for ($y = 0; $y -lt $h; $y += 16) { $g.DrawLine($pen, 0, $y, $w, $y) }
  $pen.Dispose()
}

# Header 150x57 (shown on the top of the wizard pages)
$headerPair = New-Canvas 150 57
$header = $headerPair[0]
$hg = $headerPair[1]
$hg.Clear($bg)
$hg.DrawImage($logo, 8, 10, 36, 36)
$titleFont = New-Object System.Drawing.Font $pixel, 14, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$subFont = New-Object System.Drawing.Font $pixel, 6, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$creamBrush = New-Object System.Drawing.SolidBrush $cream
$mutedBrush = New-Object System.Drawing.SolidBrush $muted
$acidDimBrush = New-Object System.Drawing.SolidBrush $acidDim
$hg.DrawString('SUNSPIRE', $titleFont, $creamBrush, 50, 11)
$hg.DrawString('MINECRAFT', $subFont, $mutedBrush, 51, 31)
$header.Save((Join-Path $outDir 'header.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$hg.Dispose(); $header.Dispose()

# Sidebar 164x314 (Welcome / Finish page)
$sidePair = New-Canvas 164 314
$side = $sidePair[0]
$sg = $sidePair[1]
$sg.Clear($bg)
Draw-Grid $sg 164 314
# Sidebar panel
$panelBrush = New-Object System.Drawing.SolidBrush $panel
$sg.FillRectangle($panelBrush, 0, 0, 164, 314)
# Redraw faint grid over panel
$pen = New-Object System.Drawing.Pen $line, 1
for ($x = 0; $x -lt 164; $x += 16) { $sg.DrawLine($pen, $x, 0, $x, 314) }
for ($y = 0; $y -lt 314; $y += 16) { $sg.DrawLine($pen, 0, $y, 164, $y) }
$pen.Dispose()
$sg.DrawImage($logo, 32, 28, 100, 100)
$logoPen = New-Object System.Drawing.Pen $acidDim, 1
$sg.DrawRectangle($logoPen, 31, 27, 102, 102)
$logoPen.Dispose()
$wordFont = New-Object System.Drawing.Font $pixel, 21, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$tagFont = New-Object System.Drawing.Font $pixel, 8, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$smallFont = New-Object System.Drawing.Font $pixel, 6, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$sg.DrawString('SUNSPIRE', $wordFont, $creamBrush, (New-Object System.Drawing.RectangleF 0, 146, 164, 30), $format)
$acidBrush = New-Object System.Drawing.SolidBrush $acid
$sg.DrawString('MINECRAFT LAUNCHER', $tagFont, $acidBrush, (New-Object System.Drawing.RectangleF 0, 180, 164, 20), $format)
$linePen = New-Object System.Drawing.Pen $acid, 1
$sg.DrawLine($linePen, 34, 212, 130, 212)
$linePen.Dispose()
$sg.DrawString('FABRIC  •  FORGE', $smallFont, $mutedBrush, (New-Object System.Drawing.RectangleF 0, 242, 164, 18), $format)
$sg.DrawString('MODRINTH', $smallFont, $mutedBrush, (New-Object System.Drawing.RectangleF 0, 256, 164, 18), $format)
$sg.DrawString('RC-OS 1.0.0', $smallFont, $acidDimBrush, (New-Object System.Drawing.RectangleF 0, 278, 164, 18), $format)
$side.Save((Join-Path $outDir 'sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
$sg.Dispose(); $side.Dispose()

$logo.Dispose()
$fonts.Dispose()
$creamBrush.Dispose(); $mutedBrush.Dispose(); $acidBrush.Dispose(); $panelBrush.Dispose(); $acidDimBrush.Dispose()
$titleFont.Dispose(); $subFont.Dispose(); $wordFont.Dispose(); $tagFont.Dispose(); $smallFont.Dispose(); $format.Dispose()

Write-Output "installer assets written to $outDir"
