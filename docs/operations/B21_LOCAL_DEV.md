# B21 — Entorno local reproducible del backend

Alcance: ejecutar, probar y observar el backend de desarrollo sin gastos remotos ni Docker local. Estado verificado el 2026-10-28 en Windows 11 (Rust 1.99.1, Python 3.12, uv 0.13.6) y en GitHub Actions `ubuntu-latest`.

## Requisitos

| Herramienta | Necesaria para | Estado |
|---|---|---|
| Rust stable + rustfmt + clippy | compilar, test, clippy | requerida |
| Python 3.11+ | harness, smoke, contratos | requerida |
| uv | `scripts/contract_check.py` (deps inline PEP 723) | requerida |
| GNU Make | targets del Makefile | opcional (los scripts corren directo) |
| Docker / PostgreSQL local | sandbox persistente | **aplazado** — la CI usa service containers; ver `DEFERRED_TOOLCHAINS.md` |

### Windows: notas reales observadas

- `python3` puede ser un alias roto de Microsoft Store: usar `python` o Git Bash, donde `python3` sí resuelve.
- `make` existe pero `VAR=valor comando` no funciona en cmd.exe; el Makefile ya contempla `SOVIR_BACKEND_REQUIRE_RUST` en Windows.
- uv funciona igual que en Linux (`uv run scripts/contract_check.py`).

## Comandos

```bash
# verificación completa local
python scripts/backend_harness.py       # estructura + fmt + test + clippy
uv run scripts/contract_check.py --self-test   # contratos + fixtures + migraciones
python scripts/harness.py check && python scripts/harness.py eval
cargo deny check && cargo audit          # si cargo-deny/audit instalados

# API de desarrollo (terminal 1)
export SOVIR_API_DEV_TOKEN="$(python -c 'import secrets;print(secrets.token_urlsafe(32))')"
cargo run -p sovir-api                   # escucha solo en 127.0.0.1:8787

# smoke (terminal 2, mismo token)
python scripts/backend_demo.py           # grant -> event -> revoke -> 403

# migraciones (requiere Postgres; en CI corre solo)
DATABASE_URL=postgres://... cargo run -p sovir-migrations -- apply|revert|status
```

## Endpoints de observabilidad

- `GET /health/live` — proceso vivo.
- `GET /health/ready` — listo para tráfico (trivial en memoria; será real cuando haya pool).
- `x-request-id` — asignado si falta, propagado en respuesta y en el span de tracing.
- Body limit 64 KB, timeout 30 s.

## Lo que NO está implementado (no fingir)

Sin Postgres local por defecto, sin adaptador sqlx de dominio, sin OIDC, sin métricas exportadas, sin dashboards. El estado por dominio y la matriz completa está en `B21_PLATFORM_STATUS.md`.
