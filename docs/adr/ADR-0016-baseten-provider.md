# ADR-0016 — Baseten como provider de inferencia remota (propuesta)

- Status: Proposed — pending maintainer signoff + privacy matrix approval
- Date: 2026-10-30
- Owners: backend (Claude) + human maintainer
- Related: ADR-0012 (seams), ADR-0010 (egress), `docs/security/PROVIDER_PRIVACY_MATRIX.md`, migration 0011

## Context

`/v1/inference/assess` already routes `Standard` mode through
`RemoteInferenceGateway` — a provider-agnostic HTTP adapter over the
controlled-egress port. What is missing is *a specific provider*. Baseten
(hosting de modelos open-weight, deployments dedicados) is the available
candidate for serving live `standard`-mode requests.

The question this ADR fixes before any token is spent: which model, what
exactly leaves the wire, at what price, and what can never leave.

## Decision

1. **Role**: Baseten serves `standard`-mode requests only — typed signal
   bundles in, typed hypotheses out (`inference-verdict.v0`). `private`
   mode is structurally incapable of reaching it (composite routing).
2. **Candidate model**: an open-weight instruct model in the ~8B class
   (e.g. a Llama-3.x-family deployment on Baseten dedicated infra).
   **TBD at approval**: exact model id/version — chosen by the Modal
   eval (ADR-0017) comparing Baseten candidates vs the local heuristic
   on the synthetic corpus, not by intuition.
3. **Exact egress payload**: `inference-request.v0` verbatim — four
   fields (`request_id`, `model`, `signals[≤8 enum]`, `privacy`). No
   content, digests, ids, timestamps or IPs — schema-enforced, tested by
   `remote_gw_injected_request_id_never_egresses`.
4. **Prohibited data** (hard, not advisory): user text, URLs, titles,
   DOM, pixel digests, principal/device/tenant ids, `private` requests,
   anything from a `SECRET`/`SENSITIVE` source beyond anonymous enum
   labels. A request that cannot serialize to the v0 shape is refused
   before egress — there is no code path that "also sends context".
5. **Spend control**: every call flows through the durable reservation
   path (`reserve` → gateway → `settle` actual / `refund` on failure,
   migration 0011). Cap: `SOVIR_INFERENCE_BUDGET_USD` per tenant, plus
   `SOVIR_INFERENCE_REQ_COST_MICROS` per request. **TBD at approval**:
   Baseten per-request/per-token price → sets the cap numbers; the
   mechanism is already live.
6. **Failure semantics**: 4xx/5xx/timeout/malformed → typed `PortError`,
   zero retries (a retry can double-spend), reservation refunded. A
   degraded provider produces `provider_unavailable`, never an invented
   verdict. Verified against the local stub tests.
7. **Residency/compliance**: Baseten is US-hosted. **TBD at approval**:
   region pinning for the dedicated deployment, DPA/data-processing
   terms, log retention on their side.

## Consequences

- Wiring = filling `SOVIR_INFERENCE_URL/KEY/MODEL` — zero new code paths.
- The provider learns at most "pattern-type X occurred" — an enum label.
  It can never correlate to a person, site or content.
- `SOVIR_INFERENCE_KEY` enters via secret manager only, never `.env`
  committed, never logged (egress sends it as an auth header only).
- If Baseten disappoints in eval, nothing is lost: the adapter is
  provider-agnostic and the cap is zero by default.

## Verification

- [x] Contract: `inference-request/verdict.v0` schemas + stub HTTP tests
      (malformed, 4xx, 5xx, timeout, injection, no-retry) — PASS.
- [ ] Eval gate (ADR-0017): Baseten candidate vs `sovir-heuristic-local`
      on `eval-inference-heuristic.v1.json` — required before wiring.
- [ ] `request_id`/`model` uniqueness so provider logs cannot join
      requests across tenants (ids are per-request random — verified).
- [ ] Fill TBDs (model, price, region, DPA) at approval time.

## Review date and rollback

Review after the first Modal eval report or when Baseten pricing/region
terms change. Rollback = unset `SOVIR_INFERENCE_*` envs; the composite
returns to local-only with zero code change.
