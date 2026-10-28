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
| `infra/backend-platform-b21` | `2adfb27` | B21-A/B/C/D (abajo) | implementación + docs |
| `feat/backend-identity-b8` | `f1d8ed7` | B8+B9: Principal, sesiones dev tipadas, Device registry, binding sellado (ADR-0006) | IMPLEMENTADO dev (sin OIDC) |
| `feat/backend-intervention-b15` | `4af583b` | InterventionSink/DeliveryChannel, backoff, auditoría, `/v1/interventions` | IMPLEMENTADO dev |
| `infra/backend-persistence-pg` | `747696c` | `crates/sovir-persistence` (5 puertos sobre sqlx) + migraciones 0001/0002 | IMPLEMENTADO — PG solo verificable en CI |
| `feat/backend-data-governance-b16` | `610129a` | export/purge por principal + `/v1/me/data` | IMPLEMENTADO dev |
| `chore/backend-hardening` | `c7dd5e0` | UUID v4, expiración de intervenciones huérfanas, ADR-0007, OpenAPI completo | IMPLEMENTADO |
| `feat/backend-ingestion-b10` | `7a9f471` | error envelope + request_id, rate limit por principal+device, `Idempotency-Key` | IMPLEMENTADO dev |
| `feat/backend-edge-runtime-b11` | `1c0702c` | benchmark criterion sobre stack de sesiones + build matrix 3-OS | IMPLEMENTADO — FFI pendiente |
| `feat/backend-integrations-b20` | `62b58d8` | WebhookEndpoint registry, HMAC-SHA256, SSRF allowlist, egress de grabación | IMPLEMENTADO dev (sin red real) |
| `chore/backend-governance-b16b` | (este) | retención ejecutable `/v1/me/retention`, `DeletionReceipt` durable (migración 0003), scrub de `device.label` | IMPLEMENTADO dev |
| `feat/backend-security-b17` | `48aa294` | `docs/security/THREAT_MODEL_B17.md` | STRIDE/LINDDUN + riesgos R1–R6 |
| `feat/backend-devices-b9` | `45e6b1d` | `docs/backend/proposals/b9-devices-adapter.md` | PROPUESTA (absorbida por b8) |

La cadena apilada es: `b21 → b8(+b9) → b15 → pg → b16 → hardening → b10 → b11 / b20 → b16b`.

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
| `cargo test --workspace` | PASS | 27 tests (dominio/app/API/migraciones) |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS | sin warnings |
| `uv run scripts/contract_check.py --self-test` | PASS | 58 checks + 3 rechazos de self-test |
| `cargo deny check` | PASS | advisories/bans/licenses/sources ok; 1 warning benigno (`syn` v2+v3) |
| `cargo audit` | PASS | 81 deps escaneadas, 0 vulnerabilidades |
| `python scripts/backend_demo.py` | PASS | sesión → grant → evento → intervención entregada → revocación → cross-principal 403 → logout 401 → export/purge+recibo → webhook SSRF 400/201/revoke → retención 200, contra server real |
| `python scripts/harness.py check` / `eval` | PASS | escaneo léxico + 15 escenarios sintéticos |
| Migraciones apply/revert en Postgres | NOT_RUN local | Docker aplazado (`DEFERRED_TOOLCHAINS.md`); se verifica en CI con service container |
| gitleaks | NOT_RUN local | job en CI |
| Inferencia remota / Modal / proveedores | NOT_IMPLEMENTED | cero llamadas; USD 0 gastados |

## Lo que sigue (orden propuesto)

| Prioridad | Trabajo | Depende de | Estado |
|---|---|---|---|
| 1 | PRs draft de la cadena → dx01 + CI verde | gh auth del maintainer | listo para crear |
| 2 | Verificación PG real del adaptador (`pg-smoke` en CI) | PR/CI run | job listo, nunca ejecutado |
| 3 | Webhook table en PG + `HttpEgress` real tras política de egress | ADR + maintainer | solo in-memory/grabación hoy |
| 4 | Job global programado de retención (b16b cubre el path por principal) | decisión de infra | NOT_IMPLEMENTED |
| 5 | Rol PG no-owner + políticas RLS reales | maintainer | default-deny solamente |
| — | B6/B19/B7, FFI real, OIDC, tenant isolation, Modal/GPU, pagos, despliegue | maintainer | BLOQUEADO |

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
