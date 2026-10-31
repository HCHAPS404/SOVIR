# ADR-0012: Inference gateway, budget ledger and threat-intel seams (B4/B5)

## Status
Accepted — boundary seams only; no provider integration.

## Context
B4 (budgeted inference) and B5 (threat intel) need real provider decisions
that only the maintainer can take. But the *boundaries* can be fixed now so
a future provider lands behind ports instead of leaking into the domain.

## Decision

1. **`InferenceGateway` port**: `assess(InferenceRequest) -> InferenceVerdict`.
   Requests carry typed signals and a `PrivacyMode` — never raw content.
   The shipped adapters are: `LocalOnlyInferenceGateway`, which honestly
   refuses (`PortError::Unavailable`); `HeuristicLocalInferenceGateway`, a
   transparent rule table over typed signals serving `Private` mode with
   zero egress — its `model_id`/`provenance` say heuristic, not ML;
   `RemoteInferenceGateway`, HTTP via controlled egress (wired only when
   URL+key+model+real egress are all set); and `CompositeInferenceGateway`,
   which routes `Private` → local ALWAYS (private can never egress, even
   with a provider configured) and `Standard` → remote-or-refuse.
   and no local model is installed. No endpoint exposes it yet.
2. **`BudgetLedger` port**: per-tenant spend tracking in micro-USD with a
   configured cap. `assess_with_inference` refuses with `BudgetExceeded`
   before any call; spend is recorded after a successful verdict.
   In-memory adapter shipped; durable tracking is an ops decision.
3. **`ThreatIntelFeed` port**: `pull(since_ms)` + `record`/`list`.
   `pull_intel` validates every indicator: provenance must be present and
   the value a bounded identifier — unverified feed items are dropped,
   never trusted. `InMemoryThreatIntel` is the dev adapter.
4. New `AppError` variants `ProviderUnavailable` (503) and
   `BudgetExceeded` (429) make both refusals explicit, never silent.

## Consequences
- A provider integration later = new adapter + config + privacy review;
  zero domain/application signature churn.
- Budget caps are per-tenant, fail-closed, and counted in micro-USD to
  avoid float money arithmetic.
- Still USD 0: nothing in this change performs a network call.
