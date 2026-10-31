# ADR-0017 — Modal para cómputo offline (evals y procesamiento acotado)

- Status: Proposed — pending maintainer signoff + privacy matrix approval
- Date: 2026-10-30
- Owners: backend (Claude) + human maintainer
- Related: ADR-0016, `docs/security/PROVIDER_PRIVACY_MATRIX.md`, `scripts/harness.py`

## Context

Modal is serverless CPU/GPU compute (containers on demand, per-second
billing). It is **not** an inference provider for the live path — no user
request ever reaches it. Its role is offline: run evals at scale and any
batch processing over synthetic or redacted data.

## Decision

1. **Allowed jobs (closed list)**:
   - **Provider eval**: run `eval-inference-heuristic.v1.json` (+ future
     corpora) against Baseten-hosted candidate models vs the local
     heuristic — produces the FP/FN/latency report that gates ADR-0016.
   - **Redacted batch work**: processing over synthetic corpora or
     aggregate counts only.
   Anything else requires amending this ADR.
2. **No continuous worker**: jobs are invoked on demand (`modal run`),
   bounded by a declared per-run USD cap and a wall-clock timeout in the
     job itself. No scheduled daemon, no always-on service, no webhook
     ingress — Modal never receives a request path.
3. **Data boundary**: inputs are files from `packages/contracts/policy/`,
   `ml/datasets/`, or generated synthetic fixtures. **User-derived data
   never enters a Modal job** — no events, signals, digests, exports or
   production DB dumps. A job that needs real data is a design failure.
4. **Spend bound**: each run declares `SOVIR_EXPERIMENT_CAP_USD` (or
   equivalent) inside the job; the job asserts its own metered spend
   stays under it and reports estimated cost in its output. Platform-side
   Modal budget alerts configured by the maintainer — **TBD at approval**.
5. **Artifacts out**: JSON reports (metrics, latency percentiles,
   per-class recall) — committed as eval artifacts, not user content.
6. **Residency/keys**: Modal is US-hosted; `MODAL_TOKEN_ID/SECRET` live
   in the secret manager, never in the repo.

## Consequences

- Modal is the *decision instrument* for Baseten: it answers "does a
  hosted model beat the local heuristic on our corpus" before a single
  production token is spent.
- Zero production coupling: no port, no adapter, no runtime dependency —
  jobs are developer-invoked scripts.
- Cheapest honest eval available: no GPU reservation, pay per second.

## Verification

- [ ] First job = corpus eval (TBD script under `ml/evals/`); must print
      per-class recall, FP, latency p50/p95, est. spend — no PASS claim
      without those numbers.
- [ ] Assert cap honored inside the job (fail the run if spend would
      exceed the declared cap).
- [ ] Fill TBDs (Modal budget alert level, exact job image) at approval.

## Review date and rollback

Review after the first eval run. Rollback = never invoke the job again;
nothing in the runtime depends on Modal.
