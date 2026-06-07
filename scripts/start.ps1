# capture-insights — one-command local start (single port :8000)
# Rebuilds frontend if dist missing or source newer than dist; then starts FastAPI.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$distIndex = Join-Path $Root "frontend\dist\index.html"
$srcApp = Join-Path $Root "frontend\src\App.tsx"
$needsBuild = -not (Test-Path $distIndex)
if (-not $needsBuild -and (Test-Path $srcApp)) {
    $needsBuild = (Get-Item $srcApp).LastWriteTime -gt (Get-Item $distIndex).LastWriteTime
}

if ($needsBuild) {
    Write-Host "Building frontend..."
    Push-Location (Join-Path $Root "frontend")
    npm run build
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
    Pop-Location
}

Write-Host "Starting capture-insights on http://127.0.0.1:8000"
uv run capture-insights serve --no-reload --port 8000