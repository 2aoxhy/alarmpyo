$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& node (Join-Path $projectRoot 'scripts\generate-brand-assets.mjs') --write
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
