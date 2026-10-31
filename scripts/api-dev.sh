#!/usr/bin/env bash
# Starts sovir-api with env loaded from .env.local (gitignored real secrets).
# Usage: bash scripts/api-dev.sh
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="$repo/.env.local"
if [[ ! -f "$env_file" ]]; then
  echo ".env.local not found — copy .env.example to .env.local and fill real values." >&2
  exit 1
fi
while IFS='=' read -r k v; do
  [[ -z "$k" || "$k" =~ ^# ]] && continue
  v="${v%$'\r'}"
  [[ -z "$v" || "$v" == *"<"* ]] && continue   # skip empty / <placeholder>
  export "$k=$v"
done < "$env_file"
cd "$repo"
exec cargo run -p sovir-api
