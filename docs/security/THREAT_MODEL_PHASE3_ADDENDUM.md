# Threat model addendum — phase 3 seams

Addendum to `THREAT_MODEL_B17.md` (branch `feat/backend-security-b17`, pending
merge — this file deliberately does not modify it). Covers only the risks
introduced by the phase-3 surfaces: inference/intel seams, OIDC seam,
tenant-scoped transactions, audit trail and retention sweeps. Same method
(STRIDE) and the same rule: mitigations listed are what the code actually
does today, not intent.

## R7 — OIDC seam (`IdentityVerifier` / `JwksIdentityVerifier`)

| Risk | Vector | Mitigation in code today |
|---|---|---|
| Spoofed tenant identity | JWT with attacker-controlled claims | Signature verified against allowlisted alg + `kid`-resolved JWK; iss/aud/exp enforced; tenant comes ONLY from validated claim |
| Downgrade to dev sessions | Client sends session-shaped token | Dispatch by token shape: JWT-shaped (two dots) never falls back to dev session; session-shaped goes to `SessionStore` |
| JWKS SSRF / key substitution | JWKS URL points at attacker host | `HttpEgress::get` re-validates allowlist per fetch; no redirects; 5s timeout; `get` default is `Unavailable` (recording egress cannot fabricate keys) |
| Stale keys after rotation | Cached `kid` outlives rotation | Unknown `kid` triggers ONE refetch then fails closed; no indefinite trust |
| Residual | Claim→scope mapping is a dev placeholder (fixed scope set); `device_id` binding unsolved for OIDC principals; dev sessions remain enabled in `local|test`. All flagged in ADR-0013 — not production authn. |

## R8 — Inference gateway (`HeuristicLocalInferenceGateway` / `RemoteInferenceGateway` / `CompositeInferenceGateway`)

| Risk | Vector | Mitigation in code today |
|---|---|---|
| Private-mode egress | `privacy=private` request reaches remote adapter | `CompositeInferenceGateway` routes by mode in the adapter itself — `Private` is served locally or refused; `RemoteInferenceGateway.serves(Standard)` only |
| Fabricated verdicts | Recording egress pretending a provider answered | `post_and_receive`/`get` default `Unavailable`; heuristic provenance is explicit (`local_heuristic_rules`) and `model_id` names the heuristic |
| Budget bypass | Client-set cost | `est_cost_micro_usd` is server-priced; local path = 0, remote = `SOVIR_INFERENCE_REQ_COST_MICROS`; cap checked BEFORE the call, spend recorded AFTER the verdict |
| Residual | Heuristic hypotheses are deterministic rules — useful for plumbing/tests, NOT detection quality claims. `confidence_bp` reflects the rule table, not a measured model. |

## R9 — Tenant-scoped transactions (`PgStore::tenant_tx`)

| Risk | Vector | Mitigation in code today |
|---|---|---|
| Cross-tenant row access | Query executed without tenant GUC | Every principal-scoped method runs inside a transaction with `SET LOCAL app.tenant_id` BEFORE any query |
| Privileged global ops leaking | Sweeps/dispatch across tenants | Deliberately separate unscoped path, marked in code; `delete_expired_any`, `pull`, global sweeps — infra only, never request traffic |
| Residual | Until the app connects as `sovir_app` (not owner), RLS is defense-in-depth only — verified in CI against `sovir_app`, not yet the default connection role. |

## R10 — Audit trail + intel fixtures

| Risk | Vector | Mitigation in code today |
|---|---|---|
| Silent spend/ingest | Inference calls and intel pulls unaudited | `inference_called` (ok/unavailable + micros) and `intel_pulled` (kept/dropped) actions; metadata only, no payloads |
| Tampered intel fixture | Edited JSON feeding indicators | Optional pinned `SOVIR_INTEL_FIXTURE_SHA256`; pinned-but-unreadable or mismatch → pull fails closed. Integrity only — NOT authenticity (no PKI claimed) |
| Tombstone growth | Revoked/expired sessions + idem keys accumulate | Global sweep deletes `expires_at_ms <= cutoff` sessions and `created_at_ms <= cutoff` idem keys; counts in `RetentionReport` + audit detail |
| Audit trail exposure | One principal reads another's actions | `audit_events` RLS + `list_by_principal` scoped (tenant, principal); export includes only the caller's rows |

## Open items for production (not mitigations)

- KMS for `webhook_endpoints.secret` and provider keys.
- Dev-session endpoint must be gated OFF outside `local|test`.
- Claim→scope mapping + device binding for OIDC (ADR-0013).
- Real provider integration still requires egress review per ADR-0010.
