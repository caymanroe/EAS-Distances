# Build distributable packages for EAS Distances extension.
# Uses .NET ZipArchive directly so entry paths use forward slashes,
# which is required by Firefox AMO validation.
#
# Outputs:
#   dist/eas-distances.zip   -- unpack and "Load unpacked" in Chrome/Edge
#   dist/eas-distances.xpi   -- install directly in Firefox

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root  = $PSScriptRoot
$dist  = Join-Path $root "dist"

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory $dist | Out-Null

$include = @(
    "manifest.json",
    "background.js",
    "qrcode.js",
    "content.js",
    "results.html",
    "results.js",
    "results.css",
    "icons/icon-48.png",
    "icons/icon-128.png"
)

function New-ExtensionZip($destPath) {
    $stream = [System.IO.File]::Open($destPath, 'Create')
    $archive = New-Object System.IO.Compression.ZipArchive($stream, 'Create')
    try {
        foreach ($rel in $include) {
            $src = Join-Path $root ($rel -replace '/', '\')
            if (-not (Test-Path $src)) { Write-Warning "Missing: $src"; continue }
            # Always use forward slashes in the entry name
            $entry = $archive.CreateEntry($rel, 'Optimal')
            $entryStream = $entry.Open()
            $fileStream  = [System.IO.File]::OpenRead($src)
            $fileStream.CopyTo($entryStream)
            $fileStream.Close()
            $entryStream.Close()
        }
    } finally {
        $archive.Dispose()
        $stream.Dispose()
    }
}

$zip = Join-Path $dist "eas-distances.zip"
$xpi = Join-Path $dist "eas-distances.xpi"

New-ExtensionZip $zip
Copy-Item $zip $xpi

Write-Host "Built:"
Write-Host "  $zip  (Chrome/Edge - unzip, then Load unpacked)"
Write-Host "  $xpi  (Firefox - Install Add-on From File)"
