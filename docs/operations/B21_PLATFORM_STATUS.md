# B21 — Estado de plataforma backend y avance del Corte 0/1

**Rama:** `infra/backend-platform-b21` · **Última actualización:** 2026-10-28 · **Estado:** Corte 0 completo, propuestas de Corte 1 publicadas. Nada de esto es producción ni despliegue público.

## Base Git verificada

- `main` = `5266049` (scaffold documental únicamente).
- `feat/design-foundations-dx01` = `05da17a` tras el merge del PR #1 (rama documental B1–B21). El responsable decidió que dx01 **aún no entra a `main`**; trabajo de Cursor continúa activo en ella.
- Las ramas B1–B21 existen en origin; las de dominio propuestas ya llevan un commit documental cada una (ver tabla).
- Los PRs de backend se abren en **draft hacia `feat/design-foundations-dx01`** para que el diff muestre solo trabajo backend. Cuando la fundación entre a `main` se repuntan sin force-push.

## Commits entregados por rama

| Rama | Head | Contenido | Tipo |
|---|---|---|---|
| `infra/backend-platform-b21` | `5be7c80` | B21-A/B/C/D (abajo) | implementación + docs |
| `feat/backend-identity-b8` | `f1d8ed7` | propuesta + implementación: Principal, sesiones dev, Device registry (ADR-0006) | IMPLEMENTADO dev (sin OIDC) |
| `feat/backend-data-governance-b16` | `a20c98c` | `docs/backend/proposals/b16-data-governance.md` | PROPUESTA + política |
| `feat/backend-security-b17` | `48aa294` | `docs/security/THREAT_MODEL_B17.md` | STRIDE/LINDDUN + riesgos R1–R6 |
| `feat/backend-devices-b9` | `45e6b1d` | `docs/backend/proposals/b9-devices-adapter.md` | PROPUESTA |
| `infra/backend-persistence-pg` | `747696c` | `crates/sovir-persistence` (5 puertos sqlx) + migraciones 0001/0002 | IMPLEMENTADO — e2e PG solo en CI |
| `feat/backend-ingestion-b10` | `c0c1b1e` | propuesta + adapter implementado (idempotency, rate limit, error envelope) | PARCIAL — falta durable store |
| `feat/backend-edge-runtime-b11` | `2513372` | propuesta + benchmark criterion + build matrix 3-OS | PARCIAL — FFI pendiente de Claude |
| `feat/backend-intervention-b15` | `4af583b` | propuesta + InterventionSink/DeliveryChannel, backoff y auditoría | IMPLEMENTADO dev (canal in-memory) |
| `feat/backend-integrations-b20` | `7af9b8c` | `docs/backend/proposals/b20-integrations.md` | PROPUESTA |

## Qué implementa Corte 0 (B21, esta rama)

1. **CI gates** (`backend.yml`): `rust-backend` (fmt/test/clippy + smoke e2e), `contracts`, `migrations` (Postgres 17 efímero: apply→revert→re-apply), `supply-chain` (`cargo deny`/`cargo audit`), `secrets` (gitleaks).
2. **`scripts/contract_check.py`**: valida OpenAPI, `$ref` local, invariantes del schema (`consent_grant_id` obligatorio, `additionalProperties: false`), fixtures conformes y política sintética (nunca `SECRET`/`payload_ref`), pares de migraciones reversibles. `--self-test` demuestra rechazo real.
3. **`services/migrations`** (`sovir-migrations`): runner sqlx `apply`/`revert`/`status` contra `DATABASE_URL`; `0001_initial` en `.up.sql`/`.down.sql`.
4. **`services/api` observabilidad**: `x-request-id` asignado/propagado, span de tracing con request_id, `/health/ready`, body limit 64 KB, timeout 30 s, 4 tests de adapter.
5. **Config**: `deny.toml`, `.gitleaks.toml`, `.env.example` por secciones, `make contract-check`, `publish = false` en todos los crates.
6. **Docs**: `B21_LOCAL_DEV.md` (runbook Windows/Linux) y este estado.

## Verificación ejecutada (Windows 11, Rust 1.99.1, Python 3.12)

| Comando | Resultado | Evidencia |
|---|---|---|
| `cargo fmt --all -- --check` | PASS | harness |
| `cargo test --workspace` | PASS | 13 tests (9 dominio/app/inference + 4 adapter HTTP) |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS | sin warnings |
| `uv run scripts/contract_check.py --self-test` | PASS | 49 checks + 3 rechazos de self-test |
| `cargo deny check` | PASS | advisories/bans/licenses/sources ok; 1 warning benigno (`syn` v2+v3) |
| `cargo audit` | PASS | 81 deps escaneadas, 0 vulnerabilidades |
| `python scripts/backend_demo.py` | PASS | grant 201 → event 201 → revoke 204 → event 403 contra server real |
| `python scripts/harness.py check` / `eval` | PASS | escaneo léxico + 15 escenarios sintéticos |
| Migraciones apply/revert en Postgres | NOT_RUN local | Docker aplazado (`DEFERRED_TOOLCHAINS.md`); se verifica en CI con service container |
| gitleaks | NOT_RUN local | job en CI |
| Inferencia remota / Modal / proveedores | NOT_IMPLEMENTED | cero llamadas; USD 0 gastados |

## Lo que sigue (orden propuesto)

| Prioridad | Trabajo | Depende de | Estado |
|---|---|---|---|
| 1 | PR draft de `infra/backend-platform-b21` → dx01 + CI verde | gh auth del maintainer | listo para crear |
| 2 | ~~B10 adapter: error envelope, rate limit, `Idempotency-Key`~~ | HECHO (in-memory; durable store pendiente) | implementado |
| 3 | ~~B11 benchmark criterion + CI matrix~~ | HECHO (ingest ~1.5µs mediana local, reporte en artifacts CI) | implementado |
| 4 | B8: `IdentityPort` + middleware principal | **revisión de Claude** sobre `b8-identity-contract.md` | propuesta publicada |
| 5 | B16: migración 0003 (retention, consent_audit) + endpoints erasure/export | B8 principal | diseño listo |
| 6 | B9 persistencia devices | B8 | contrato listo |
| 7 | B15 cola de entregas `in_process` | `InterventionSink` de Claude | contrato listo |
| 8 | B20 webhooks | B15 cola + B19 tenants | contrato listo |
| — | B6/B19/B7, FFI real, Modal/GPU, pagos, despliegue | maintainer + Claude | BLOQUEADO |

## Decisiones pendientes del maintainer

1. Autenticar `gh` para crear issues/PRs draft.
2. Proveedor OIDC para B8 (o sesiones dev tipadas primero).
3. Retenciones exactas por clase de dato (B16).
4. Presupuesto Modal por experimento (55/25/20 propuesto en `SPONSOR_CREDITS`).
5. Proveedor de pagos (B7) — diferido.

## Riesgos registrados

Ver `docs/security/THREAT_MODEL_B17.md` (R1–R6). El crítico: `grant_id`/`source_id` autodeclarables en body — aceptado solo en loopback dev, bloquea cualquier despliegue.

## Costo

USD 0. Todo ejecutado con toolchain local y GitHub Actions. Modal/proveedores solo con aprobación explícita por experimento.
