# SOVIR — Backend master plan and implementation contract

> **State:** development scaffold, not deployed consumer protection. Integration with web/mobile UI is through documented HTTP contracts in development. Platform native screen capture is NOT implemented by this backend.

## 1. Two different execution planes

**Edge plane (device-local):** native screen watchers and extensions produce only authorized observation events. The shared Rust domain/application/policy logic is designed to run on device (once bindings and storage adapters exist), even without connectivity. It should retain local evidence encrypted, minimize CPU/GPU/RAM/battery/token consumption, and NEVER bypass OS permission boundaries.

**Control plane (services):** ingestion of consented/minimized events when explicitly enabled, deeper investigation, user/device auth, account controls, subscriptions, aggregated indicators, federation and SDK billing. The current Axum server is local, in-memory, demonstration-only. It is **not** the final cloud service.

## 2. Dependency direction

```text
native adapters / browser / API / cron
                   |
       adapters ----+----> ports <---- application ----> domain
                   |              |                     ^
                   +--------------+---------------------+

sovir-inference: independent budget/reservation building block.
```

- `sovir-domain`: valid consent, taxonomy, pure policy and evidence DTOs. No I/O.
- `sovir-ports`: clock, repositories, risk analyzer contracts.
- `sovir-application`: grant, revoke, ingest; orchestration, fail-closed.
- `sovir-adapters`: dev in-memory implementation, deterministic analyzer.
- `sovir-inference`: token/cost governor (in-memory gate; not billing system).
- `services/api`: local Axum HTTP adapter; auth is development token, loopback only.
- `services/investigator`, `threat-intel`, `infra/baseten|modal|fireworks`: placeholders for separately reviewed adapters.

## 3. Bounded contexts and ownership

| Context | Owns | Not allowed |
|---|---|---|
| Identity & Consent | principal, device, granular source grant, expiry, revocation | self-declared tenant IDs trusted from event body |
| Observation & Evidence | immutable event header, source, timestamps, provenance | raw screenshots in default logs |
| Risk & Autonomy Policy | risk hypothesis, intervention boundaries, confidence limits | automatic blocking from unverified LLM output |
| Research & Inference | provider routing, budget, provenance, prompt-injection isolation | unbounded or covert model requests |
| Threat Intelligence | verified indicators with redaction and TTL | sharing individual psychology or private conversations |
| Accounts & Billing | measured usage, authorized quotas and invoice reconciliations | silent overages |

## 4. Threat boundaries

1. OS permission is NOT equivalent to internal filtering; neither creates server-side legal basis on its own.
2. Local event signals are untrusted hints: browser content may impersonate system instructions.
3. Consent grants must be bound to authenticated principal + device + source + modality, not merely an ID supplied in JSON. Current local demo deliberately lacks real identity and MUST NEVER be Internet-exposed.
4. Revocation must invalidate both future data capture and future inference. Durable design needs transactional consistency and distributed invalidation; this demo checks before insert but is not race-safe across processes.
5. Never transmit screenshots, OTPs, passwords, ID numbers or private messages as events in default mode.
6. LLM responses are advisory JSON/data; deterministic policy engine alone authorizes actions.
7. For `SENSITIVE` events, require an additional policy before cloud transfer. Demo only receives event metadata and rejects payload references; secret class always rejected.
8. Threat intelligence cannot infer mental illness, targeted vulnerabilities or political preferences from user content.

## 5. API contracts

See `packages/contracts/openapi/backend-dev.v0.yaml` and
`packages/contracts/schemas/observed-event.schema.json`. Current endpoints:

- `GET /health/live` — process liveness.
- `POST /v1/consents` — synthetic scoped grant (demo only).
- `POST /v1/consents/{id}/revoke` — revocation.
- `POST /v1/events` — validates data and consent then emits conservative assessment.

Do not connect production apps before adding auth, tenant isolation and durable storage.
Future write APIs need idempotency keys, signed device attestation where possible,
version headers, pagination, rate limits, genuine OpenAPI request/response conformance,
replay protection and standardized error shapes.

## 6. Database and event backbone

- Edge: encrypted SQLite with per-source retention and deletion UI; adapters outstanding.
- Cloud: PostgreSQL + tenant-bound RLS after security review; proposed DDL under `infra/postgres/migrations/` is **not automatically applied**.
- Append-only observation events, mutable grant revocation state, signed/traceable provenance.
- Internal event bus only after outbox/idempotent consumer semantics are built. Begin with in-process dispatch; adopt NATS/Kafka solely if measured scaling requires it.
- Blob storage for raw evidence is **off by default**; add encrypted per-subject ephemeral storage only with separate ADR.

## 7. Provider strategy

- **Meta Muse Spark:** primary reasoning/multimodal candidate; Standard mode for allowed private data, after separate provider adapter and budgets. Current inference is mock/deterministic, no API calls.
- **Baseten:** candidate hosting for approved specialized models; do not bind domain objects to SDK.
- **Modal:** on-demand compute for evaluation and redacted processing; no continuous GPU worker by default.
- **Fireworks:** optional benchmark/fallback for model endpoints, opt-in; never silent provider failover for private data.
- Provider-specific adapters should implement `InferenceGateway` (future port) with explicit residency, privacy, USD hard caps, redaction, timeout, retries, usage accounting and consistent structured error types.
- Do not send untrusted content as system prompt; bound tool permissions; maintain evidence lineage.

## 8. Resource Intelligence / costs

- Gate 0: change detection and dedup (zero tokens).
- Gate 1: on-device OCR/classifiers (device energy, zero remote tokens).
- Gate 2: temporal memory/heuristics (zero remote tokens by default).
- Gate 3: remote reasoning ONLY with user policy + prior reserve + explicit provider allowed.
- Gate 4: research tool chain with per-investigation max spend and bounded steps.
- Ledger quantities: request_id, tenant/principal, provider/model, input/output/image tokens, estimated cost, actual cost, timestamp, reasons, redaction tier, cache hits.
- Dev governor `sovir-inference` implements **in-memory reservation only**. Need durable reservations, settlement/refund and concurrency tests before paid service use.
- Never say 95% cache-hit achieved without measured samples. Collect p50/p95 latency, inference_per_active_hour, USD/active_user-month, false-negative rates, idle CPU/memory, network bytes and battery.

## 9. Harness and release gates

- `make backend-check`: static contract, Cargo fmt/clippy/test (where Rust available).
- `make backend-run`: loopback demo (requires SOVIR_API_DEV_TOKEN).
- `make backend-smoke`: synthetic grant→event→revoke→403 against running dev API.
- `.github/workflows/backend.yml`: Rust build, format, lint, tests, no paid inference.
- Next gates: OpenAPI parser/client generation, Postgres integration and RLS, security linting, k6 latency benchmark, supply-chain audit (`cargo deny/audit`), multi-arch and native FFI test.

## 10. Milestones, not an artificial simplification of vision

B0. Real Rust workspace + local dev path + gates (this deliverable).
B1. Identity, device trust, granular grant/event scopes, durable storage + data deletion.
B2. Event normalization/temporal evidence graph and local IPC/FFI for platform adapters.
B3. Rules/evidence/risk policy evaluation and ML eval harness; false positives measured.
B4. Budgeted real inference gateway + providers + privacy modes + provider contracts.
B5. Research workflows, threat intel ingestion with verification, audit provenance.
B6. Sync, encrypted backups, tenant isolation and enterprise integrations.
B7. Security reviews, signed builds, observability, billing and production hardening.

## 11. Existing frontend compatibility

- Preserve `apps/website`, `apps/console`, `apps/extension`, `apps/android`, `apps/ios`, `apps/desktop`, `design/figma`, and existing Figma docs.
- Web console consumes generated clients from `packages/contracts/openapi/` after API versioning; never duplicates risk logic in React.
- All mobile/desktop sensors stay in platform-owned paths; backend exposes interfaces not OS capture hacks.
- User-visible copy must distinguish observed signals, hypothesis and verified investigation.
- Any public landing claims require evidence; frontend only shows real backend coverage.

## 12. Agent responsibilities for backend

- Claude: domain/ports/application/inference; enforces tests; proposes ADR for contract changes.
- Cursor: native sensor adapters and UI bindings in `apps/`, typed API clients and app orchestration; not a backend owner and must not alter `crates/` or `services/` without separately approved backend ticket.
- Devin: backend services, identity infrastructure, durable persistence, security operations, CI, Docker, PostgreSQL migrations, observability and benchmarks in isolated PRs.
- ChatGPT: backend architecture/ADR, contract and eval specifications, security/FinOps review; may implement a specifically assigned backend issue in its own PR when authorized, subject to independent review.
- Maintainer: merge, budgets and provider selection, security/privacy authorization.
- One owner per file/PR, no AI commits to `main` without human approval. Use `feat/backend-<context>-<issue>` short-lived branches.

## 13. What is NOT implemented

No production database adapter, identity/OIDC, real platform watcher, private user syncing,
real Meta/Baseten/Modal/Fireworks API integration, ML prediction, fraud detection accuracy,
production-grade RLS/tenancy, telemetry SLAs, secure device capture, migrations runner,
full audit/consent UX, key lifecycle, or end-to-end deployed service.


## 14. Actualización de dominios de backend B1–B21 (2026-10-28)

**Estado:** diseño organizativo confirmado como referencias Git, **no** implementación funcional. Esta ampliación precisa el mapa B0–B7 previo; no sustituye sus hitos técnicos ni cambia la arquitectura modular hexagonal.

| Grupo | IDs | Responsabilidad principal | Restricción |
|---|---|---|---|
| Identidad, autorización y dispositivos | B8, B1, B9 | Principal autenticado, consentimiento granular, dispositivo y fuente | Revocación efectiva y aislamiento por identidad |
| Observación y persistencia | B11, B10, B2 | Runtime local eficiente, ingestión validada y evidencia de procedencia | No capturas crudas ni secretos en logs predeterminados |
| Memoria y análisis | B12, B13, B14 | Contexto temporal, detectores especializados y modelos predictivos evaluados | No inferencias clínicas, acusaciones sin corroboración o predicción no calibrada |
| Decisión e intervención | B3, B15 | Políticas deterministas y acciones autorizadas | El LLM propone, las políticas gobiernan |
| Investigación e IA | B4, B5, B18 | Proveedores, presupuestos, investigación e indicadores verificados | Privacidad, procedencia y límites de gastos por paso |
| Datos y seguridad | B16, B17 | Minimización, retención, borrado, cifrado y claves | Garantías transversales, no etapa opcional |
| Servicios y empresa | B6, B7, B19, B20 | Sincronización, monetización, tenant y APIs/SDKs | Acceso por necesidad y no compartición de conversaciones personales |
| Plataforma operativa | B21 | CI/CD, persistencia, telemetría y recuperación | Métricas sin contenido de pantalla |

Las 21 referencias remotas se listan con nombre exacto, ownership, prioridad y reglas de PR en [`docs/operations/BRANCHES.md`](../operations/BRANCHES.md). El registro de creación y sus límites están en [`docs/operations/BACKEND_BRANCH_CREATION_LOG_2026-10-28.md`](../operations/BACKEND_BRANCH_CREATION_LOG_2026-10-28.md).

**Orden lógico de dependencias:** B8/B1/B9 + B16/B17 → B11/B10/B2 → B12/B13 → B3/B15, usando B4/B5 solo cuando haga falta; B14/B18/B6/B7/B19/B20 se integran sobre contratos maduros. B21 se desarrolla transversalmente. Las ramas no deben llevar cambios de contrato incompatibles sin ADR y revisión.

**Regla de transición:** `main` aún debe incorporar mediante PR la fundación `84ebf5581538c68d515e34e2e1493cd4f496c53d`. No empezar cambios divergentes sin resolver ese merge base. Mantener las ramas cortas; los IDs son dominios, no microservicios.


## 15. Multiagente: reparto definitivo de ejecución backend (2026-10-28)

**Owner de backend:** Claude + Devin + ChatGPT (tickets explícitos); **Cursor es owner del frontend y adaptadores nativos**. El maintainer humano aprueba merges y presupuestos. No hay ejecución autónoma ni PR autoaprobados.

| Backend | Implementación primaria | Revisión y límites |
|---|---|---|
| B1–B5, B12–B14, B18 | Claude | ChatGPT: contratos, seguridad, métricas; Devin: infraestructura necesaria |
| B6–B8, B16–B17, B19, B21 | Devin | Claude: impacto dominio y seguridad; ChatGPT: arquitectura y riesgos |
| B9–B11 y B15 (Rust, lógica de backend) | Claude; Devin para servicios/persistencia/CI | Cursor sólo adaptadores de sistema operativo y experiencia de aplicación |
| B20 (interfaces de servidor) | Devin; Claude para contratos | Cursor usa APIs/SDK y crea clientes generados, no cambia backend |
| Tickets de auditoría, ADR y prototipos backend específicamente asignados | ChatGPT, si se autoriza | Revisión independiente y PR, nunca cambio unilateral de `main` |

**Separación obligatoria:** `crates/`, `services/`, `infra/` y `packages/contracts` requieren owner del backend. `apps/` y puentes Swift/Kotlin/JS pertenecen a Cursor bajo un contrato publicado; tocar API, política o backend para arreglar una pantalla requiere un ticket nuevo. Detalles y rama exacta por ID: [`docs/operations/BRANCHES.md`](../operations/BRANCHES.md).

**Fondos de hackathon confirmados por el responsable:** Modal USD 100 acreditados, disponibles durante la competencia según informa el usuario; fecha/hora de caducidad exactas y elegibilidad de cada cómputo deben verificarse en el panel de Modal. No asumir continuidad ni convertir créditos temporales en costos de producción. Se documenta en [`docs/operations/SPONSOR_CREDITS_2026-10-28.md`](../operations/SPONSOR_CREDITS_2026-10-28.md). Todo trabajo GPU en Modal requiere ticket, cuota máxima, estimado de costo, etiquetas de experimento y apagado automático; Devin gestiona jobs/infra, Claude las evals/modelos, ChatGPT audita resultados y gastos.
