# Build distributable packages for EAS Distances extension.
# Outputs:
#   dist/eas-distances.zip   — unpack and "Load unpacked" in Chrome/Edge
#   dist/eas-distances.xpi   — install directly in Firefox (Install Add-on From File)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$dist = Join-Path $root "dist"

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory $dist | Out-Null

$include = @(
  "manifest.json",
  "background.js",
  "content.js",
  "results.html",
  "results.js",
  "results.css",
  "icons"
)

# Stage into a temp folder so Compress-Archive picks up the right structure.
$stage = Join-Path $dist "_stage"
New-Item -ItemType Directory $stage | Out-Null
foreach ($item in $include) {
  $src = Join-Path $root $item
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $stage $item) -Recurse
  }
}

$zip = Join-Path $dist "eas-distances.zip"
$xpi = Join-Path $dist "eas-distances.xpi"

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip
Copy-Item $zip $xpi

Remove-Item $stage -Recurse -Force

Write-Host "Built:"
Write-Host "  $zip  (Chrome/Edge - unzip, then Load unpacked)"
Write-Host "  $xpi  (Firefox - Install Add-on From File)"
