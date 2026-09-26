# 重新生成中文摊位招牌图集。使用 Windows 自带的 .NET 绘图和中文字体。
Add-Type -AssemblyName System.Drawing

$outputPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../public/models/props/signs.png'))
$bitmap = [System.Drawing.Bitmap]::new(2048, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::Transparent)

$cream = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 241, 234, 214))
$warmCream = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 244, 231, 196))
$gold = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 232, 176, 74))
$chalk = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 236, 235, 228))
$ink = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 28, 28, 28))
$dialFace = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 233, 228, 214))
$dialPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 28, 28, 28), 5)
$nameFont = [System.Drawing.Font]::new('华文行楷', 183, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$shopFont = [System.Drawing.Font]::new('华文行楷', 148, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$subFont = [System.Drawing.Font]::new('微软雅黑', 67, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$headingFont = [System.Drawing.Font]::new('微软雅黑', 72, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$priceFont = [System.Drawing.Font]::new('微软雅黑', 54, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$dialFont = [System.Drawing.Font]::new('微软雅黑', 52, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$dialUnitFont = [System.Drawing.Font]::new('微软雅黑', 38, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

function Draw-Centered([string] $label, [System.Drawing.Font] $font, [System.Drawing.Brush] $brush,
    [float] $x, [float] $y, [float] $width, [float] $height) {
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString($label, $font, $brush, [System.Drawing.RectangleF]::new($x, $y, $width, $height), $format)
    $format.Dispose()
}

try {
    # 招牌沿用原图集的 UV 区域：乔 0–256；玛尔塔 256–512。
    Draw-Centered '乔的鲜鱼铺' $nameFont $cream 180 14 1688 210
    $graphics.FillEllipse($gold, 20, 106, 90, 48)
    $graphics.FillPolygon($gold, [System.Drawing.Point[]]@(
        [System.Drawing.Point]::new(110, 130), [System.Drawing.Point]::new(142, 105), [System.Drawing.Point]::new(142, 155)))
    $graphics.FillEllipse($gold, 1935, 106, 92, 48)
    $graphics.FillPolygon($gold, [System.Drawing.Point[]]@(
        [System.Drawing.Point]::new(1938, 130), [System.Drawing.Point]::new(1902, 105), [System.Drawing.Point]::new(1902, 155)))

    Draw-Centered '玛尔塔船具店' $shopFont $warmCream 80 256 1350 134
    Draw-Centered '鱼饵 · 钓具 · 燃油' $subFont $gold 155 389 1200 92

    # 黑板价格区域限制在图集左下角的 1024 × 512 像素。
    $graphics.DrawString('今日收鱼价', $headingFont, $chalk, 58, 520)
    $graphics.DrawString('红笛鲷 ........ $18/公斤', $priceFont, $chalk, 68, 631)
    $graphics.DrawString('猪齿鱼 ........ $16/公斤', $priceFont, $chalk, 68, 701)
    $graphics.DrawString('黄尾笛鲷 ...... $12/公斤', $priceFont, $chalk, 68, 771)
    $graphics.DrawString('蓝纹石鲈 $7  大西洋鲹 $6', $priceFont, $chalk, 68, 841)
    $graphics.DrawString('黑鳍金枪鱼 / 鬼头刀  请询价', $priceFont, $chalk, 68, 911)

    # 右下角保留原秤盘的 0–25 公斤刻度。
    $centerX = 1792.0
    $centerY = 768.0
    $graphics.FillEllipse($dialFace, 1560, 536, 464, 464)
    for ($tick = 0; $tick -le 50; $tick++) {
        $angle = (-150 + $tick * 6) * [Math]::PI / 180
        $inner = if ($tick % 10 -eq 0) { 170 } elseif ($tick % 2 -eq 0) { 186 } else { 194 }
        $outer = 210
        $graphics.DrawLine($dialPen,
            [float]($centerX + [Math]::Sin($angle) * $inner), [float]($centerY - [Math]::Cos($angle) * $inner),
            [float]($centerX + [Math]::Sin($angle) * $outer), [float]($centerY - [Math]::Cos($angle) * $outer))
    }
    for ($mark = 0; $mark -le 5; $mark++) {
        $angle = (-150 + $mark * 60) * [Math]::PI / 180
        $x = $centerX + [Math]::Sin($angle) * 130 - 60
        $y = $centerY - [Math]::Cos($angle) * 130 - 35
        Draw-Centered ([string]($mark * 5)) $dialFont $ink $x $y 120 70
    }
    Draw-Centered '公斤' $dialUnitFont $ink 1727 771 130 60

    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "已生成 $outputPath"
}
finally {
    foreach ($item in @($nameFont, $shopFont, $subFont, $headingFont, $priceFont, $dialFont, $dialUnitFont,
        $cream, $warmCream, $gold, $chalk, $ink, $dialFace, $dialPen, $graphics, $bitmap)) { $item.Dispose() }
}
