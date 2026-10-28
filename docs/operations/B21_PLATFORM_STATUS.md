# B21 — Estado de plataforma backend (Fase 0 + primer gate)

**Rama:** `infra/backend-platform-b21` · **Fecha del diagnóstico:** 2026-10-28 · **Estado:** diagnóstico verificado, primer gate CI añadido. Nada de esto es producción.

## Base Git verificada

- `main` = `526604937d66566f38f879419b5eaa9e15348f8c` (scaffold documental únicamente).
- `feat/design-foundations-dx01` = `84ebf5581538c68d515e34e2e1493cd4f496c53d`, cinco commits sobre `main`, **no integrada** por decisión del responsable (el frente web sigue activo).
- Las ramas B1–B21 existen en origin y apuntan todas a `84ebf55` sin commits propios.
- Los PRs de backend se abren en **draft hacia `feat/design-foundations-dx01`** para que el diff muestre solo trabajo backend, sin arrastrar el scaffold hacia `main`. Cuando la fundación entre a `main`, las bases se repuntan sin force-push.

## Verificación ejecutada (Windows 11, Rust 1.99.1, Python 3.12)

| Comando | Resultado | Evidencia |
|---|---|---|
| `cargo fmt --all -- --check` | PASS | `scripts/backend_harness.py` |
| `cargo test --workspace` | PASS | 9 tests: 5 dominio, 2 aplicación, 2 inference |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS | sin warnings |
| `python scripts/backend_harness.py` | PASS | estructura + toolchain completo |
| `python scripts/harness.py check` | PASS | escaneo léxico; no es verificación AST completa |
| `python scripts/harness.py eval` | PASS | 15 escenarios sintéticos; sin modelo real |
| `uv run scripts/contract_check.py --self-test` | PASS | 48 checks: OpenAPI, JSON Schema, fixtures, sobre-declaración de rechazo |
| Docker / PostgreSQL local | NOT_INSTALLED | aplazado en `DEFERRED_TOOLCHAINS.md`; Postgres se prueba vía service container en CI |
| `make backend-smoke` | NOT_RUN | requiere server en marcha con token dev |
| Inferencia remota / Modal / proveedores | NOT_IMPLEMENTED | sin llamadas de pago; USD 0 gastados |

## Inventario real

- Rust: `sovir-domain`, `sovir-ports`, `sovir-application`, `sovir-adapters` (memoria), `sovir-inference` (gobernador en memoria) + `services/api` (Axum, loopback, token dev).
- Contratos: `packages/contracts/openapi/backend-dev.v0.yaml`, `packages/contracts/schemas/observed-event.schema.json`.
- Persistencia: `infra/postgres/migrations/0001_initial.sql` propuesta con RLS sin políticas (default-deny); **sin runner ni adaptador**.
- CI existente: `ci.yml` (harness) y `backend.yml` (Rust gate).

## Qué añade este gate (PR B21-A)

1. `scripts/contract_check.py` — valida OpenAPI, resolución de `$ref`, invariantes del schema (consent obligatorio, `additionalProperties: false`), conformidad de fixtures y política de fixtures sintéticos (nunca `SECRET`, nunca `payload_ref`). `--self-test` demuestra que el gate rechaza documentos inválidos.
2. Workflow `backend.yml` — jobs `contracts`, `supply-chain` (`cargo deny check` + `cargo audit`) y `secrets` (gitleaks).
3. `deny.toml` — licencias permitidas, advisories, bans, fuentes.
4. `.gitleaks.toml` — reglas por defecto + allowlist de fixtures/placeholders.
5. `make contract-check` — gate local equivalente.

## Brechas conocidas (siguientes cortes B21)

- Sin runner de migraciones ni job de migraciones (B21-B).
- Sin correlation IDs, `/health/ready` ni límite de body en `services/api` (B21-C).
- Sin separación de envs ni runbook Windows/Linux (B21-D).
- Identidad real, persistencia, RLS policies, observabilidad de métricas: dominios B8/B16/B17, pendientes.

## Costo

USD 0. Todo se ejecuta con toolchain local y GitHub Actions. Modal/proveedores solo con aprobación explícita por experimento.
