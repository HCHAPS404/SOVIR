# Provider privacy matrix — canonical (invariant 8)

Canonical matrix for every external provider decision. Each provider ADR
references this file; a provider may not ship code until its row is
filled and a human signs off.

## Structural boundary (what egress CAN carry — schema-enforced)

`inference-request.v0` may only contain:

| Field | Content | Could it identify a user? |
|---|---|---|
| `request_id` | Opaque id, `valid_identifier`-validated (bounded charset, no free text) | No — random, per-request |
| `model` | Model label string | No |
| `signals` | ≤8 enum labels (`PAYMENT_REQUEST`, `URGENT_ACTION`, ...) | No content — but reveals *that a situation type occurred* |
| `privacy` | `standard` \| `private` | No |

What it can NEVER contain (schema `additionalProperties: false` + no
fields exist): raw content, DOM/title text, URLs, `content_digest`,
principal/device/tenant ids, timestamps, IPs. The `request_id` injection
test (`remote_gw_injected_request_id_never_egresses`) enforces this.

## Per-mode rule (structural, not policy)

| Privacy mode | May egress? | Why |
|---|---|---|
| `private` | **NEVER** | `CompositeInferenceGateway` routes it local-only; `RemoteInferenceGateway.serves(private)` returns false |
| `standard` | Provider-dependent (below) | Typed signals only, under reservation cap |

## Per-class rule (event data classes)

| `SensitiveDataClass` | May any derived signal egress? |
|---|---|
| `SECRET` | **NO** — refused at ingest validation, never stored, never egressed |
| `SENSITIVE` | Only as anonymous enum labels under `standard` mode + human-approved provider |
| `PERSONAL` | Same as SENSITIVE |
| `PUBLIC` | Same as SENSITIVE |

Note: the egress payload carries no data class — the constraint is that
signals derived from ANY class leave only as anonymous enum labels. The
information a provider can learn is bounded to "a pattern type occurred",
never what/where/who.

## Provider rows

| Provider | Purpose | What egresses | What NEVER egresses | Spend bound | Residency | Status |
|---|---|---|---|---|---|---|
| **Local heuristic** | `private` + `standard` fallback | Nothing — no egress | Everything stays | $0 | Device | IMPLEMENTED |
| **Baseten** | Live `standard`-mode inference candidates (hosted open-weight model) | `inference-request.v0` as above | Content, ids, digests, `private` requests | Durable reservation cap + settle actual cost (migration 0011) | US-hosted infra; region pinning TBD at approval | PROPOSED — ADR-0016 |
| **Modal** | Offline evals + redacted batch processing | Synthetic corpora + aggregate metrics ONLY — no user-derived data at all | Any production request, any event-derived data | Per-experiment USD cap declared in the job | US-hosted infra | PROPOSED — ADR-0017 |
| **Meta (Llama API)** | Alternate `standard`-mode reasoning | Same `inference-request.v0` | Same as Baseten | Same reservation cap | Meta infra — TBD at approval | NOT_PROPOSED — needs its own ADR before any use |

## Approval checklist (invariant 8) — required per provider

- [ ] ADR merged with privacy matrix row filled (no TBD)
- [ ] Exact egress payload re-verified against `inference-request.v0`
- [ ] Spend cap provisioned + reservation path tested against a stub
- [ ] Human maintainer signoff recorded in the PR

`Private` mode egress remains structurally impossible regardless of any
provider row added here — that invariant is code, not policy.
