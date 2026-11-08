$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& node (Join-Path $PSScriptRoot 'build.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Extension build failed.' }
foreach ($browserName in @('firefox', 'chrome', 'edge', 'safari')) {
    $sourcePath = Join-Path $projectRoot "dist/$browserName/*"
    $archivePath = Join-Path $projectRoot "proxypaste-$browserName.zip"
    Compress-Archive -Path $sourcePath -DestinationPath $archivePath -Force
    Write-Output "Packaged $archivePath"
}
