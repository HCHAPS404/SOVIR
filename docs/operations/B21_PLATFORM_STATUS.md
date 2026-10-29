# B21 — Estado de plataforma backend y avance del Corte 0/1

**Rama:** `feat/backend-phase2` · **Última actualización:** 2026-10-29 · **Estado:** Corte 0/1 completos + fase 2 (puertos async, B19 tenants, RLS, egress policy). Nada de esto es producción ni despliegue público.

## Base Git verificada

- `main` = `5266049` (scaffold documental únicamente).
- `feat/design-foundations-dx01` = `05da17a`. Los PRs de backend (#2–#11) están en draft en cadena hacia `dx01`; el responsable decide los merges.
- `feat/backend-phase2` apila sobre `chore/backend-governance-b16b` con el trabajo de fase 2 (commits `db60ca6`, `584bb40`, infra+egress).

## Commits entregados por rama

| Rama | Head | Contenido | Tipo |
|---|---|---|---|
| `infra/backend-platform-b21` | `2adfb27` | B21-A/B/C/D | implementación + docs |
| `feat/backend-identity-b8` | `f1d8ed7` | B8+B9: Principal, sesiones dev tipadas, Device registry (ADR-0006) | IMPLEMENTADO dev (sin OIDC) |
| `feat/backend-intervention-b15` | `4af583b` | InterventionSink/DeliveryChannel, backoff, auditoría | IMPLEMENTADO dev |
| `infra/backend-persistence-pg` | `747696c` | `crates/sovir-persistence` + migraciones 0001/0002 | IMPLEMENTADO — PG verificado en CI |
| `feat/backend-data-governance-b16` | `610129a` | export/purge + `/v1/me/data` | IMPLEMENTADO dev |
| `chore/backend-hardening` | `c7dd5e0` | UUID v4, huérfanas, ADR-0007, OpenAPI | IMPLEMENTADO |
| `feat/backend-ingestion-b10` | `7a9f471` | error envelope, rate limit, `Idempotency-Key` | IMPLEMENTADO dev |
| `feat/backend-edge-runtime-b11` | `1c0702c` | benchmark criterion + build matrix | IMPLEMENTADO — FFI pendiente |
| `feat/backend-integrations-b20` | `62b58d8` | WebhookEndpoint registry, HMAC-SHA256, SSRF allowlist | IMPLEMENTADO dev |
| `chore/backend-governance-b16b` | `e4a3b0d` | retención `/v1/me/retention`, `DeletionReceipt` (0003), scrub label | IMPLEMENTADO dev |
| `feat/backend-phase2` | HEAD | **Fase 2** (abajo) | IMPLEMENTADO dev |
| `feat/backend-security-b17` | `48aa294` | `docs/security/THREAT_MODEL_B17.md` | STRIDE/LINDDUN + R1–R6 |

## Fase 2 (feat/backend-phase2)

1. **Puertos async (ADR-0008)**: los 9 puertos de I/O con `async_trait`;
   `sovir-persistence` elimina `block_in_place`/`Handle::block_on`. `Clock`/
   `RiskAnalyzer` siguen síncronos (cómputo puro). Bench con `block_on`
   dentro de `iter` — medición honesta del camino async.
2. **Tenancy B19 (ADR-0009)**: `tenant_id` sellado por servidor en grant,
   evento, device, intervention, webhook y receipt; todos los lookups de
   puertos son `(tenant_id, principal_id[, device_id])`; `validate_consent`
   exige igualdad de tenant; `dev-session` acepta `tenant_id` declarado
   (nunca prueba de auth). Migración **0005** (columnas + PK devices por
   tenant). Test cross-tenant incluido.
3. **Rol + RLS (migración 0006)**: rol `sovir_app` no-owner con políticas
   `tenant_isolation` en las 6 tablas principal-owned. El owner bypassa
   RLS (CI/migraciones); conectar como `sovir_app` sin
   `SET app.tenant_id` cierra en vacío (fail closed). Middleware que haga
   `SET LOCAL` por request queda pendiente de OIDC real.
4. **Webhooks durables (migración 0007)**: tabla `webhook_endpoints` +
   `WebhookRegistry` en `PgStore`; con `DATABASE_URL` los endpoints son
   durables (in-memory sigue siendo el fallback).
5. **Barrido global de retención**: `enforce_retention_global` + task
   `tokio::spawn` cada `SOVIR_RETENTION_SWEEP_MS` (0/unset = desactivado).
   Es la única operación cross-tenant, reservada a infra.
6. **Egress real tras flag (ADR-0010)**: `ReqwestHttpEgress` — allowlist
   re-validado por envío, redirects deshabilitados, timeout 5 s. Solo si
   `SOVIR_HTTP_EGRESS=real` + allowlist explícita + `SOVIR_ENV=local|test`;
   cualquier otra configuración graba en memoria (cero red por defecto).
7. **Propuestas** `b6-sync-tenancy.md` y `b7-billing-payments.md`:
   delimitadas para decisión del maintainer, sin código.
8. **Idempotencia durable (migración 0008)**: puerto `IdempotencyStore`
   (scoped por tenant+principal), tabla `idempotency_keys` con RLS +
   `INSERT ON CONFLICT DO NOTHING`; `DELETE /v1/me/data` también borra las
   claves del principal (`idem_keys_deleted` en reporte y recibo).
9. **RLS verificado en CI**: paso `migrations` que conecta como `sovir_app`
   y demuestra aislamiento (tenant-a ve 1 fila, tenant-b ve la suya, sin
   tenant 0 filas, insert cross-tenant rechazado por WITH CHECK).
10. **Esquema `ApiError` corregido** en OpenAPI: sobre real
    `{error:{code,request_id,retryable}}`; tests SSRF de borde
    (userinfo, subdominio, IPv6, esquema, mayúsculas, host vacío);
    `backend_demo.py` verifica aislamiento cross-tenant en vivo.

## Verificación ejecutada (Windows 11, Rust 1.99.1, Python 3.12)

| Comando | Resultado | Evidencia |
|---|---|---|
| `cargo fmt --all -- --check` | PASS | harness |
| `cargo test --workspace` | PASS | 29 tests (dominio/app/API/migraciones) |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS | sin warnings |
| `uv run scripts/contract_check.py --self-test` | PASS | 70 checks + rechazos de self-test |
| `cargo deny check` / `cargo audit` | PASS previo; rerun en CI | reqwest 0.12 nueva dep |
| `python scripts/backend_demo.py` | PASS | incluye cross-tenant 403 + `idem_keys_deleted` |
| Migraciones apply/revert (0001–0008) | verificado en CI | service container Postgres 17 |
| `sovir_app` + RLS efectivo | verificado en CI | paso RLS del job `migrations` |
| Egress real (`SOVIR_HTTP_EGRESS=real`) | NOT_RUN | requiere endpoint HTTP real; grabación es el default |
| Inferencia remota / Modal / proveedores | NOT_IMPLEMENTED | USD 0 |

## Lo que sigue (orden propuesto)

| Prioridad | Trabajo | Depende de | Estado |
|---|---|---|---|
| 1 | Revisión + merge de PRs #2–#11 en orden | maintainer | drafts verdes en CI |
| 2 | PR de `feat/backend-phase2` (este) | revisión | draft abierto |
| 3 | OIDC real → tenant desde token + `SET LOCAL app.tenant_id` + eliminar `dev-session` fuera de local/test | B6 propuesta aprobada | BLOQUEADO maintainer |
| — | FFI, Modal/GPU, pagos, despliegue | maintainer | BLOQUEADO |

## Decisiones pendientes del maintainer

1. Merge/review de la cadena + fase 2.
2. OIDC (proveedor) → tenancy verificada y middleware `SET LOCAL`.
3. Proveedor de pagos (B7) — propuesta escrita.
4. Presupuesto Modal por experimento.

## Riesgos registrados

Ver `docs/security/THREAT_MODEL_B17.md` (R1–R6). Residuales tras fase 2:
`tenant_id` dev sigue autodeclarado (documentado en ADR-0009 — sin OIDC no
hay tenant verificado); egress real existe pero apagado por defecto;
`webhook_endpoints.secret` en claro en dev (KMS pendiente).

## Costo

USD 0. Toolchain local + GitHub Actions; ninguna llamada de red con datos.
