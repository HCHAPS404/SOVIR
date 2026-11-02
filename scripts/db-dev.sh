#!/usr/bin/env bash
# Brings up the optional local Postgres + applies all migrations in order.
# Optional: WITH_OIDC=1 also starts the local Keycloak IdP (profile `oidc`).
# Usage: bash scripts/db-dev.sh
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo/infra/postgres"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found — install Docker Desktop (docs/operations/DEFERRED_TOOLCHAINS.md)." >&2
  exit 1
fi

if [[ "${WITH_OIDC:-0}" == "1" ]]; then
  docker compose --profile oidc up -d
  echo "Keycloak: http://127.0.0.1:8081 (admin/admin_local_only) — create realm 'sovir' + clients."
else
  docker compose up -d postgres
fi

echo "Waiting for Postgres…"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U sovir_dev -d sovir_dev >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for f in migrations/*.up.sql; do
  echo "== $f"
  docker compose exec -T postgres psql -U sovir_dev -d sovir_dev -v ON_ERROR_STOP=1 < "$f"
done

echo "Done. Point the API at it with:"
echo "  DATABASE_URL=postgres://sovir_dev:ci_ephemeral_local_only@127.0.0.1:5433/sovir_dev"
