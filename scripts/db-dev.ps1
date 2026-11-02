# Brings up the optional local Postgres + applies all migrations in order.
# Optional: -WithOidc also starts the local Keycloak IdP (profile `oidc`).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\db-dev.ps1 [-WithOidc]
param([switch]$WithOidc)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $repo 'infra\postgres')

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker not found — install Docker Desktop (docs/operations/DEFERRED_TOOLCHAINS.md)."
}

if ($WithOidc) {
  docker compose --profile oidc up -d
  Write-Host "Keycloak: http://127.0.0.1:8081 (admin/admin_local_only) — create realm 'sovir' + clients."
} else {
  docker compose up -d postgres
}

Write-Host "Waiting for Postgres…"
foreach ($i in 1..30) {
  docker compose exec -T postgres pg_isready -U sovir_dev -d sovir_dev 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
}

Get-ChildItem migrations -Filter *.up.sql | Sort-Object Name | ForEach-Object {
  Write-Host "== $($_.Name)"
  Get-Content $_.FullName -Raw | docker compose exec -T postgres psql -U sovir_dev -d sovir_dev -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw "migration $($_.Name) failed" }
}

Write-Host "Done. Point the API at it with:"
Write-Host "  DATABASE_URL=postgres://sovir_dev:ci_ephemeral_local_only@127.0.0.1:5433/sovir_dev"
