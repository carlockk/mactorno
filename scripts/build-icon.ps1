Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "..\public\app.png"
$outputDir = Join-Path $PSScriptRoot "..\build"
$pngPath = Join-Path $outputDir "icon-256.png"
$icoPath = Join-Path $outputDir "icon.ico"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$source = [System.Drawing.Image]::FromFile($sourcePath)
$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.DrawImage($source, 0, 0, 256, 256)

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$stream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($stream)

$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]32)
$writer.Write([UInt32]$pngBytes.Length)
$writer.Write([UInt32]22)
$writer.Write($pngBytes)

[System.IO.File]::WriteAllBytes($icoPath, $stream.ToArray())

$writer.Dispose()
$stream.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$source.Dispose()

Write-Output "Created $icoPath"
