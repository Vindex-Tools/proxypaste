$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'extension/icons'

function New-RoundedRectangle([single]$x, [single]$y, [single]$width, [single]$height, [single]$radius) {
    $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2
    $shape.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $shape.AddArc(($x + $width - $diameter), $y, $diameter, $diameter, 270, 90)
    $shape.AddArc(($x + $width - $diameter), ($y + $height - $diameter), $diameter, $diameter, 0, 90)
    $shape.AddArc($x, ($y + $height - $diameter), $diameter, $diameter, 90, 90)
    $shape.CloseFigure()
    return $shape
}

# Render the geometry in logo.svg at high resolution before downsampling.
foreach ($size in @(16, 32, 48, 64, 96, 128)) {
    $canvas = New-Object System.Drawing.Bitmap ($size * 4), ($size * 4)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.ScaleTransform(($size / 16.0), ($size / 16.0))
    $orange = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#d76b18'))
    $dark = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#303030'))
    foreach ($part in @(
        @{ X = 12; Y = 12; W = 40; H = 48; R = 4; Brush = $orange },
        @{ X = 16; Y = 16; W = 32; H = 40; R = 1; Brush = $dark },
        @{ X = 23; Y = 4; W = 18; H = 16; R = 3; Brush = $orange }
    )) {
        $shape = New-RoundedRectangle $part.X $part.Y $part.W $part.H $part.R
        $graphics.FillPath($part.Brush, $shape)
        $shape.Dispose()
    }
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 4
    $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Square
    $points = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF 23, 29),
        (New-Object System.Drawing.PointF 31, 36),
        (New-Object System.Drawing.PointF 23, 43)
    )
    $graphics.DrawLines($pen, $points)
    $graphics.DrawLine($pen, 36, 43, 43, 43)
    $icon = New-Object System.Drawing.Bitmap $size, $size
    $output = [System.Drawing.Graphics]::FromImage($icon)
    $output.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $output.DrawImage($canvas, 0, 0, $size, $size)
    $icon.Save((Join-Path $iconDirectory "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $output.Dispose()
    $icon.Dispose()
    $pen.Dispose()
    $orange.Dispose()
    $dark.Dispose()
    $graphics.Dispose()
    $canvas.Dispose()
}
Write-Output 'Generated clipboard terminal icons (16-128 px).'
