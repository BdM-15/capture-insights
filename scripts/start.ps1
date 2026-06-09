# capture-insights - one-command local start (single port :8000)
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
    $hasSam = $envText -match 'SAM_API_KEY\s*=\s*\S+' -and $envText -notmatch 'SAM_API_KEY\s*=\s*your_sam_api_key_here'
    Write-Host ("  .env: found | SAM_API_KEY: " + $(if ($hasSam) { "configured" } else { "missing or placeholder" }))
} else {
    Write-Host "  .env: missing (copy .env.example)"
}
Write-Host ("  DuckDB: " + $(if (Test-Path $duckPath) { "ready ($duckPath)" } else { "NOT FOUND - run ingest first" }))
Write-Host "  SAM budget: tracked at data/sam_budget.json (1000 calls/day)"
Write-Host "  Live checks: GET /ready after server starts`n"

$distIndex = Join-Path $Root "frontend\dist\index.html"
$srcRoot = Join-Path $Root "frontend\src"
$needsBuild = -not (Test-Path $distIndex)
if (-not $needsBuild -and (Test-Path $srcRoot)) {
    $distTime = (Get-Item $distIndex).LastWriteTime
    $newestSrc = Get-ChildItem $srcRoot -Recurse -File -Include *.tsx,*.ts,*.css |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($newestSrc -and $newestSrc.LastWriteTime -gt $distTime) {
        $needsBuild = $true
    }
}

if ($needsBuild) {
    Write-Host "Building frontend..."
    Push-Location (Join-Path $Root "frontend")
    npm run build
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
    Pop-Location
}

Write-Host "Validating Agent Skills (skills-ref)..."
uv run python scripts/validate_skills.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "Skill validation failed - fix skills/*/SKILL.md before starting." -ForegroundColor Red
    exit $LASTEXITCODE
}

$port = 8000
$alreadyUp = $false
try {
    $health = Invoke-WebRequest -Uri "http://127.0.0.1:$port/health" -UseBasicParsing -TimeoutSec 3
    if ($health.StatusCode -eq 200) { $alreadyUp = $true }
} catch {}

$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($alreadyUp) {
    Write-Host "capture-insights already running on http://127.0.0.1:$port (health OK). Hard refresh the browser if UI looks stale."
    exit 0
}
if ($listener) {
    Write-Host "Port $port is in use but health check failed - stopping stale process $($listener.OwningProcess)..."
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Write-Host "Starting capture-insights on http://127.0.0.1:$port"
uv run uvicorn backend.app.main:app --host 127.0.0.1 --port $port