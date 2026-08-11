param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$assetRoot = Join-Path $ProjectRoot 'assets\play-store'
$backgroundPath = Join-Path $assetRoot 'feature-background.png'
$iconPath = Join-Path $ProjectRoot 'assets\images\alarmpyo-icon.png'
$titleFontPath = Join-Path $ProjectRoot 'assets\fonts\WantedSans-ExtraBold.ttf'
$featurePath = Join-Path $assetRoot 'alarmpyo-feature-graphic.png'
$storeIconPath = Join-Path $assetRoot 'alarmpyo-icon-512.png'

function Decode-Text([string]$value) {
  return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($value))
}

foreach ($requiredPath in @($backgroundPath, $iconPath, $titleFontPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw ((Decode-Text '7ZWE7IiYIOydtOuvuOyngCDrmJDripQg6riA6ry07J2EIOywvuyngCDrqrvtlojslrTsmpQ6IA==') + $requiredPath)
  }
}

function New-HighQualityGraphics([System.Drawing.Image]$image) {
  $graphics = [System.Drawing.Graphics]::FromImage($image)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  return $graphics
}

function Draw-CoverImage(
  [System.Drawing.Graphics]$graphics,
  [System.Drawing.Image]$source,
  [System.Drawing.Rectangle]$destination
) {
  $sourceRatio = $source.Width / $source.Height
  $destinationRatio = $destination.Width / $destination.Height

  if ($sourceRatio -gt $destinationRatio) {
    $cropHeight = $source.Height
    $cropWidth = [int][Math]::Round($cropHeight * $destinationRatio)
    $cropX = [int](($source.Width - $cropWidth) / 2)
    $cropY = 0
  } else {
    $cropWidth = $source.Width
    $cropHeight = [int][Math]::Round($cropWidth / $destinationRatio)
    $cropX = 0
    $cropY = [int](($source.Height - $cropHeight) / 2)
  }

  $sourceRectangle = [System.Drawing.Rectangle]::new($cropX, $cropY, $cropWidth, $cropHeight)
  $graphics.DrawImage(
    $source,
    $destination,
    $sourceRectangle,
    [System.Drawing.GraphicsUnit]::Pixel
  )
}

$background = [System.Drawing.Image]::FromFile($backgroundPath)
$icon = [System.Drawing.Image]::FromFile($iconPath)
$titleFonts = [System.Drawing.Text.PrivateFontCollection]::new()
$titleFonts.AddFontFile($titleFontPath)

try {
  $feature = [System.Drawing.Bitmap]::new(
    1024,
    500,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  $feature.SetResolution(144, 144)
  $graphics = New-HighQualityGraphics $feature
  try {
    Draw-CoverImage $graphics $background ([System.Drawing.Rectangle]::new(0, 0, 1024, 500))
    $overlay = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(54, 0, 0, 0))
    try {
      $graphics.FillRectangle($overlay, 0, 0, 1024, 500)
    } finally {
      $overlay.Dispose()
    }

    $graphics.DrawImage($icon, [System.Drawing.Rectangle]::new(90, 115, 270, 270))

    $titleFont = [System.Drawing.Font]::new(
      $titleFonts.Families[0],
      76,
      [System.Drawing.FontStyle]::Regular,
      [System.Drawing.GraphicsUnit]::Pixel
    )
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    try {
      $graphics.DrawString('알람표', $titleFont, $white, 414, 205)
    } finally {
      $titleFont.Dispose()
      $white.Dispose()
    }

    $feature.Save($featurePath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $feature.Dispose()
  }

  $storeIcon = [System.Drawing.Bitmap]::new(512, 512)
  $storeIcon.SetResolution(144, 144)
  $iconGraphics = New-HighQualityGraphics $storeIcon
  try {
    $iconGraphics.DrawImage($icon, [System.Drawing.Rectangle]::new(0, 0, 512, 512))
    $storeIcon.Save($storeIconPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $iconGraphics.Dispose()
    $storeIcon.Dispose()
  }
} finally {
  $titleFonts.Dispose()
  $icon.Dispose()
  $background.Dispose()
}

Write-Output ((Decode-Text 'UGxheSDsiqTthqDslrQg64yA7ZGcIOq3uOuemO2UveydhCDrp4zrk6Tsl4jslrTsmpQ6IA==') + $featurePath)
Write-Output ((Decode-Text 'UGxheSDsiqTthqDslrQg7JWE7J207L2Y7J2EIOunjOuTpOyXiOyWtOyalDog') + $storeIconPath)
