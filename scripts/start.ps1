# capture-insights — one-command local start (single port :8000)
# Rebuilds frontend if dist missing or source newer than dist; then starts FastAPI.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# Readiness preflight (Future Opportunities + SAM budget)
$envFile = Join-Path $Root ".env"
$duckPath = Join-Path $Root "data\usaspending.duckdb"
Write-Host "`n--- Workstation readiness ---"
if (Test-Path $envFile) {
    $envText = Get-Content $envFile -Raw
    $hasSam = $envText -match 'SAM_API_KEY\s*=\s*\S+' -and $envText -notmatch 'SAM_API_KEY\s*=\s*SAM-7fa8ffb7'
    Write-Host ("  .env: found | SAM_API_KEY: " + $(if ($hasSam) { "configured" } else { "missing or placeholder" }))
} else {
    Write-Host "  .env: missing (copy .env.example)"
}
Write-Host ("  DuckDB: " + $(if (Test-Path $duckPath) { "ready ($duckPath)" } else { "NOT FOUND — run ingest first" }))
Write-Host "  SAM budget: tracked at data/sam_budget.json (1000 calls/day)"
Write-Host "  Live checks: GET /ready after server starts`n"

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
uv run uvicorn backend.app.main:app --host 127.0.0.1 --port 8000