# Environment reference — `sovir-api`

Every variable the API reads, its default, and what it actually does.
Defaults keep the process local-first: zero network egress, zero spend,
dev sessions on loopback only.

## Core

| Var | Default | Behavior |
|---|---|---|
| `SOVIR_ENV` | `local` | `local`/`test` enable `/v1/auth/dev-session`; anything else disables it entirely |
| `SOVIR_API_BIND` | `127.0.0.1:8787` | Bind address; refuses non-loopback (fail closed) |
| `SOVIR_API_URL` | `http://127.0.0.1:8787` | **Console-side** (`apps/console` server code): base URL the BFF calls; the browser never reaches the API directly |
| `DATABASE_URL` | unset | Postgres `PgStore` when set (migrations + durable adapters); in-memory otherwise |
| `SOVIR_POSTGRES_DEV_PASSWORD` | unset | Local docker-compose password only — never prod |
| `SOVIR_PG_ADMIN_URL` | unset | Privileged Postgres pool used ONLY to run migrations at startup when `DATABASE_URL` is set; the app role connects via `DATABASE_URL` without DDL rights |
| `SOVIR_RATE_LIMIT_PER_MIN` | `60` | Per-principal+device fixed-window limiter (in-memory, per-process) |
| `SOVIR_BUILD_SHA` | `dev` | **Build-time** (`option_env!`): commit stamped into `/v1/version`; not read at runtime |

## Policy & risk (B3)

| Var | Default | Behavior |
|---|---|---|
| `SOVIR_POLICY_PACK` | built-in `dev-1` | Path to a versioned `PolicyPack` JSON; malformed = refuse startup |

## Retention & sweeps (B16/B20)

| Var | Default | Behavior |
|---|---|---|
| `SOVIR_RETENTION_MS` | 30 days | Cutoff age for events/terminal interventions/session tombstones/idem keys |
| `SOVIR_RETENTION_SWEEP_MS` | `0` (off) | Periodic global sweep interval; only infra path that may cross tenants |
| `SOVIR_DISPATCH_SWEEP_MS` | `0` (off) | Periodic global dispatch of due interventions |
| `SOVIR_INTEL_SWEEP_MS` | `0` (off) | Periodic validated pull of the intel feed (global sweep) |
| `SOVIR_INTEL_TENANT` | `dev` | Fallback tenant for intel indicators without `tenant_id` |
| `SOVIR_RESERVATION_SWEEP_MS` | `0` (off) | Periodic refund of orphaned `pending` inference reservations |
| `SOVIR_RESERVATION_TTL_MS` | `600000` | Age after which a `pending` reservation is treated as orphaned |

## Egress & webhooks (ADR-0010/B20)

| Var | Default | Behavior |
|---|---|---|
| `SOVIR_HTTP_EGRESS` | `record` | `real` + allowlist + `local|test` = reqwest adapter (allowlist re-checked per send, no redirects, 5s timeout); anything else records only |
| `SOVIR_WEBHOOK_ALLOWLIST` | `127.0.0.1,localhost` | Host allowlist for webhook URLs AND JWKS/inference hosts (SSRF guard) |

## Inference (B4/ADR-0012)

| Var | Default | Behavior |
|---|---|---|
| `SOVIR_LOCAL_INFERENCE` | on (`!= off`) | Local heuristic gateway serves `private` mode; `off` = private refuses too |
| `SOVIR_INFERENCE_URL`/`_KEY`/`_MODEL` | unset | ALL THREE + real egress = `RemoteInferenceGateway` wired for `standard`; partial config = never wired |
| `SOVIR_INFERENCE_REQ_COST_MICROS` | `10000` | Server-side price per remote request (client never sets cost); local = 0 |
| `SOVIR_INFERENCE_BUDGET_USD` | `0` | Per-tenant hard cap in whole USD; 0 = no remote spend allowed |
| `SOVIR_ALLOW_REMOTE_INFERENCE` | `false` | `true` = startup refuses (remote path must go through the seam, not this flag) |

## Threat intel (B5)

| Var | Default | Behavior |
|---|---|---|
| `SOVIR_INTEL_FIXTURE` | unset | JSON fixture of `IntelIndicator` items; unset = empty feed |
| `SOVIR_INTEL_FIXTURE_SHA256` | unset | Pinned sha256 of fixture bytes; mismatch/unreadable/malformed → fail closed |

## OIDC seam (B6/ADR-0013)

| Var | Default | Behavior |
|---|---|---|
| `SOVIR_OIDC_JWKS_URL` + `SOVIR_OIDC_ISSUER` + `SOVIR_OIDC_AUDIENCE` | unset | ALL THREE required (partial = refuse startup); unset = dev sessions only. JWKS host must be allowlisted + `SOVIR_HTTP_EGRESS=real` |
| `SOVIR_OIDC_TENANT_CLAIM` | `tenant_id` | Claim carrying tenant binding |
| `SOVIR_OIDC_PRINCIPAL_CLAIM` | `sub` | Claim carrying subject |

## Observer (`sovir-observer` — separate binary, ADR-0014)

| Var | Default | Behavior |
|---|---|---|
| `SOVIR_API_URL` | `http://127.0.0.1:8787` | API base URL the observer posts to (dev-session mint + events) |
| `SOVIR_OBSERVER_POLL_MS` | `2000` | Foreground-window poll interval |
| `SOVIR_OBSERVER_QUEUE_MAX` | `64` | In-memory queue bound; oldest dropped on overflow |
| `SOVIR_OBSERVER_EXCLUDE` | unset | Comma-separated process names never observed (exact, case-insensitive) |
| `SOVIR_OBSERVER_DISABLE` | unset | Set = daemon idles (pause kill-switch) |
| `SOVIR_OBSERVER_STORE_PATH` + `SOVIR_OBSERVER_STORE_KEY` | unset | BOTH set = durable encrypted outbox (`sovir-edge-store`, ChaCha20-Poly1305, key ≥32 bytes); unset = in-memory queue only |

## Non-variables (explicitly not configurable)

- Session TTL, intervention backoff, sequence window (1h), pagination caps
  (100/500), body limit (64KiB), timeout (30s) — code constants, not envs.
- No `SOVIR_TELEMETRY_ENABLED` consumer exists — value reserved, not read.
