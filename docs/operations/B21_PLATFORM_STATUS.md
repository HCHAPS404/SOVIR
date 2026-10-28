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
| `uv run scripts/contract_check.py --self-test` | PASS | 52 checks: OpenAPI, JSON Schema, fixtures, pares de migraciones, sobre-declaración de rechazo |
| `make backend-smoke` | PASS (local) | grant 201 → event 201 → revoke 204 → event 403 contra server real |
| `cargo test --workspace` | PASS | 13 tests (9 anteriores + 4 de adapter HTTP) |
| `cargo deny check` / `cargo audit` | PASS | licencias/bans/fuentes ok; 81 deps, 0 vulnerabilidades |
| Migraciones apply/revert en Postgres | NOT_RUN local | Docker aplazado; se verifica en CI con service container |
| Docker / PostgreSQL local | NOT_INSTALLED | aplazado en `DEFERRED_TOOLCHAINS.md` |
| Inferencia remota / Modal / proveedores | NOT_IMPLEMENTED | sin llamadas de pago; USD 0 gastados |

## Inventario real

- Rust: `sovir-domain`, `sovir-ports`, `sovir-application`, `sovir-adapters` (memoria), `sovir-inference` (gobernador en memoria) + `services/api` (Axum, loopback, token dev).
- Contratos: `packages/contracts/openapi/backend-dev.v0.yaml`, `packages/contracts/schemas/observed-event.schema.json`.
- Persistencia: `infra/postgres/migrations/0001_initial.sql` propuesta con RLS sin políticas (default-deny); **sin runner ni adaptador**.
- CI existente: `ci.yml` (harness) y `backend.yml` (Rust gate).

## Qué añade este trabajo (B21)

1. `scripts/contract_check.py` — valida OpenAPI, resolución de `$ref`, invariantes del schema, conformidad de fixtures, política sintética y pares de migraciones reversibles. `--self-test` demuestra que el gate rechaza documentos inválidos.
2. Workflow `backend.yml` — jobs `rust-backend` (ahora con smoke e2e), `contracts`, `migrations` (Postgres efímero), `supply-chain` (`cargo deny`/`audit`), `secrets` (gitleaks).
3. `deny.toml` + `.gitleaks.toml` — licencias, advisories, bans, fuentes y allowlist de fixtures.
4. `services/migrations` (`sovir-migrations`) — runner sqlx apply/revert/status contra `DATABASE_URL`; `0001_initial` en formato reversible `.up.sql`/`.down.sql`.
5. `services/api` — `x-request-id`, span de tracing con request_id, `/health/ready`, límite de 64 KB, timeout 30 s, 4 tests de adapter.
6. `make contract-check`, `B21_LOCAL_DEV.md` (runbook Windows/Linux) y `.env.example` por secciones.

## Brechas conocidas (siguientes cortes)

- Sin adaptador sqlx de dominio (la API sigue en memoria) — espera puerto de persistencia de Claude + ticket.
- Sin políticas RLS ni rol de aplicación (default-deny deliberado) — B16/B19.
- Sin identidad real (B8), sin métricas exportadas ni dashboards, sin OIDC.
- Migraciones de `undo` limitadas: cada `.up.sql` debe traer su `.down.sql` desde ahora.

## Costo

USD 0. Todo se ejecuta con toolchain local y GitHub Actions. Modal/proveedores solo con aprobación explícita por experimento.
