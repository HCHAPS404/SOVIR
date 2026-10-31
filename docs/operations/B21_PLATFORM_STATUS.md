# B21 — Estado de plataforma backend y avance del Corte 0/1

**Rama:** `feat/backend-phase3` · **Última actualización:** 2026-10-29 · **Estado:** Corte 0/1 completos + fase 2 (puertos async, B19 tenants, RLS, egress policy) + fase 3 (B2 evidence sequences, B3 policy packs, B4/B5 seams, audit log, dispatch sweep, paginación). Nada de esto es producción ni despliegue público.

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
| `feat/backend-phase2` | `a3c58f8`+ | **Fase 2** (abajo) | IMPLEMENTADO dev |
| `feat/backend-phase3` | HEAD | **Fase 3** (abajo) | IMPLEMENTADO dev |
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
   `SET app.tenant_id` cierra en vacío (fail closed). Cierre de fase 3:
   **`SET LOCAL app.tenant_id` implementado** — `tenant_tx()` envuelve
   cada método principal-scoped en una transacción que fija el GUC antes
   de consultar; las ops cross-tenant (`delete_expired`, `pull`, sweeps
   globales) mantienen el pool sin scope — documentado como privilegiado.
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

## Fase 3 (feat/backend-phase3)

1. **B2 evidence sequences (ADR-0011)**: `normalize_events` (orden
   determinista + dedup por `event_id`) y `detect_sequences` sobre la
   ventana `EVIDENCE_WINDOW_MS` del principal. Patrones tipados
   (`HookThenPayment`, `IdentityThenCredential`,
   `EscalatingManipulation`) — nunca afirmaciones de intención. Los
   hallazgos solo **elevan el piso** de decisión (`observe→review`,
   `HookThenPayment→warn+high`); jamás debilitan consentimiento ni
   ejecutan acción protegida. `EventDecision.sequence_findings` +
   `EventRepository::list_recent` (in-memory + PG, índice
   `events_tenant_principal_time` en 0009).
2. **B3 policy packs versionados**: `PolicyPack` + `PolicyRule` como
   datos serializables; `DeterministicRiskAnalyzer` evalúa
   `PolicyPack::dev_pack()` y cada `Assessment` lleva `policy_version`
   auditable. Corpus sintético `eval_corpus_dev1` con métricas
   TP/FP/TN/FN — paridad pack↔JSON verificada en los 256 combos de
   señales. No hay claim de precisión real (corpus sintético).
3. **Audit log unificado (migración 0009)**: `AuditAction`/`AuditEvent`
   metadata-only; registran emisión de sesión, grants/revocaciones,
   devices, webhooks, **evento ingerido** (con `decision` +
   `policy_version`), dispatch, retención y purge. `GET /v1/me/audit`
   scoped por tenant+principal. Tabla `audit_events` con RLS — las
   entradas sobreviven al borrado (tombstones de gobernanza).
4. **Dispatch de fondo**: `dispatch_due_global` + task
   `SOVIR_DISPATCH_SWEEP_MS` (0/unset = off). `deliver_one` compartido
   preserva bindings tenant/principal de cada intervención.
5. **Paginación**: `?limit=` acotado (def. 100, máx 500) en
   `/v1/interventions`, `/v1/devices`, `/v1/webhooks`, `/v1/me/audit`.
   Cierre: `inference_called` e `intel_pulled` registran gasto e ingesta;
   `GET /v1/me/data` exporta también el audit trail propio.
6. **Consolidación final** (este commit):
   - `PgStore::tenant_tx` — `SET LOCAL app.tenant_id` por operación scoped.
   - `SOVIR_POLICY_PACK` — carga de pack versionado desde JSON (B3 real).
   - `SOVIR_INTEL_FIXTURE_SHA256` — integridad sha256 del fixture (no PKI).
   - Tombstones de sesión por edad: `expires_at_ms <= cutoff` en el sweep.
   - **OIDC seam (ADR-0013)**: `IdentityVerifier` port +
     `JwksIdentityVerifier` (firma, kid, alg allowlist, iss/aud/exp,
     claims→tenant) vía nuevo `HttpEgress::get` fail-closed; dispatch por
     forma de token sin downgrade; verificado en vivo con RS256 real.
6. **B4 seams (ADR-0012)**: puerto `InferenceGateway` (señales tipadas
   ↔ hipótesis tipadas, nunca contenido crudo ni acciones autorizadas),
   `PrivacyMode` (Standard/Private) con `serves()` por gateway, y
   `BudgetLedger` por tenant en micro-USD — el chequeo de cap corre
   **antes** de llamar y `record_spend` solo tras veredicto exitoso.
   Sin gateway ⇒ `ProviderUnavailable` (503); cap agotado ⇒
   `BudgetExceeded` (429). Default cap 0 = fail closed. Migración
   **0010** `inference_budget` + `SOVIR_INFERENCE_BUDGET_USD`.
7. **B5 seams (ADR-0012)**: puerto `ThreatIntelFeed`; `pull_intel`
   descarta candidatos sin `provenance` verificable o `value` inválido,
   estampa `tenant_id` del servidor y persiste en `intel_indicators`
   (0010, RLS). `LocalOnlyInferenceGateway` sirve solo `Private`.
8. **Limpieza de sesiones expiradas**: índice `sessions_expiry` (0009);
   los tombstones de sesión se conservan por gobernanza — expiración no
   borra evidencia.
9. **B4 montado end-to-end (sin provider)**: `RemoteInferenceGateway` —
   adapter HTTP real sobre `HttpEgress.post_and_receive` (método nuevo del
   puerto; default `Unavailable` para que el egress de grabación jamás
   fabrique veredictos). Sirve SOLO `Standard` — `Private` nunca egresa
   por invariante. Contratos versionados `inference-request.v0` /
   `inference-verdict.v0` en `packages/contracts/schemas` — señales
   tipadas adentro, contenido estructuralmente imposible fuera.
   `POST /v1/inference/assess` con precio server-side
   (`SOVIR_INFERENCE_REQ_COST_MICROS` — el cliente nunca fija su coste).
   Cableado solo si `SOVIR_HTTP_EGRESS=real` + `SOVIR_INFERENCE_URL`/`KEY`/
   `MODEL` — si falta algo, 503 honesto.
10. **B5 montado (sin feed externo)**: `FileThreatIntelFeed` (fixture JSON
    por `SOVIR_INTEL_FIXTURE`, fail closed si falta) +
    `CompositeThreatIntelFeed` (source→pull, store→record/list) para que
    el feed alimente la tabla durable. `POST /v1/intel/pull` +
    `GET /v1/intel` con paginación.

## Verificación ejecutada (Windows 11, Rust 1.99.1, Python 3.12)

| Comando | Resultado | Evidencia |
|---|---|---|
| `cargo fmt --all -- --check` | PASS | harness |
| `cargo test --workspace` | PASS | 50 tests (dominio/app/API/migraciones + B4/B5 + adapters) |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS | sin warnings |
| `uv run scripts/contract_check.py --self-test` | PASS | 76 checks + rechazos de self-test |
| `python scripts/harness.py check` / `eval` | PASS | eval: corpus sintético, sin modelo real |
| `cargo deny check` / `cargo audit` | PASS previo; rerun en CI | reqwest 0.12 nueva dep |
| `python scripts/backend_demo.py` | PASS | cross-tenant 403 + secuencias + audit + `?limit=` + seams 503/empty |
| Migraciones apply/revert (0001–0010) | verificado en CI | service container Postgres 17 |
| `sovir_app` + RLS efectivo | verificado en CI | paso RLS cubre audit/budget/intel |
| Egress real (`SOVIR_HTTP_EGRESS=real`) | NOT_RUN | requiere endpoint HTTP real; grabación es el default |
| Inferencia remota / Modal / proveedores | NOT_IMPLEMENTED | USD 0; `assess_with_inference` rechaza sin gateway |
| Feeds de threat-intel externos | NOT_IMPLEMENTED | `PgStore::pull` devuelve vacío por diseño |

## Lo que sigue (orden propuesto)

| Prioridad | Trabajo | Depende de | Estado |
|---|---|---|---|
| 1 | Revisión + merge de PRs #2–#12 en orden | maintainer | drafts verdes en CI |
| 2 | PR de `feat/backend-phase3` (este) | revisión | draft abierto |
| 3 | OIDC → elegir provider + gatear dev-session fuera de local/test + claim→scope mapping + device binding | B6 propuesta aprobada | seam montado y verificado (JWKS RS256 real); provider ausente |
| 4 | Proveedor de inferencia real (B4): gateway HTTP tras flag + cap provisionado | decisión maintainer + egress ADR | seam listo, provider ausente |
| 5 | Feed threat-intel externo (B5): `pull` con provenance verificable | decisión maintainer | seam listo, feed ausente |
| — | FFI, Modal/GPU, pagos, despliegue | maintainer | BLOQUEADO |

## Decisiones pendientes del maintainer

1. Merge/review de la cadena + fases 2 y 3.
2. OIDC (proveedor) → tenancy verificada y middleware `SET LOCAL`.
3. Proveedor de inferencia (B4) + cap por plan; feed de inteligencia (B5).
4. Proveedor de pagos (B7) — propuesta escrita.
5. Presupuesto Modal por experimento.

## Riesgos registrados

Ver `docs/security/THREAT_MODEL_B17.md` (R1–R6). Residuales tras fase 2:
`tenant_id` dev sigue autodeclarado (documentado en ADR-0009 — sin OIDC no
hay tenant verificado); egress real existe pero apagado por defecto;
`webhook_endpoints.secret` en claro en dev (KMS pendiente).

## Costo

USD 0. Toolchain local + GitHub Actions; ninguna llamada de red con datos.
