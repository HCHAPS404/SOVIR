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
- Cursor: native local adapters, UI binding, typed clients and app orchestration; never changes domain unreviewed.
- Devin: CI, Docker, postgres migrations, observability infrastructure and benchmarks in isolated PRs.
- ChatGPT: architecture review, testing criteria, privacy economics and contract design.
- Maintainer: merge, budgets and provider selection, security/privacy authorization.
- One owner per file/PR, no AI commits to `main` without human approval. Use `feat/backend-<context>-<issue>` short-lived branches.

## 13. What is NOT implemented

No production database adapter, identity/OIDC, real platform watcher, private user syncing,
real Meta/Baseten/Modal/Fireworks API integration, ML prediction, fraud detection accuracy,
production-grade RLS/tenancy, telemetry SLAs, secure device capture, migrations runner,
full audit/consent UX, key lifecycle, or end-to-end deployed service.
