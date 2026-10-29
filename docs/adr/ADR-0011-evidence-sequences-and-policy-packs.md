# ADR-0011: Evidence sequences, normalization and versioned policy packs

## Status
Accepted — implements B2/B3 for the development backend.

## Context
Risk evaluation so far treats each `ObservedEvent` in isolation with a
hardcoded signal table. Real social-engineering harm is sequential: a lure
or urgency cue followed by a payment or credential request inside a short
window. Hardcoded rules also cannot be audited: a decision cannot name the
rule set that produced it.

## Decision

1. **Normalization (domain, pure)**: `normalize_events` deduplicates by
   `event_id` and orders by `observed_at_ms`. This is the only canonical
   ordering for evidence.
2. **Sequence detection (domain, pure)**: `detect_sequences` finds typed
   `SequenceFinding`s in a normalized window — currently
   `HookThenPayment` (manipulation cue earlier, `PaymentRequest` later),
   `IdentityThenCredential` and `EscalatingManipulation`. Findings carry
   the event ids and span; they never contain payloads.
3. **Evidence window (port change)**: `EventRepository::list_recent`
   returns the principal's events with `observed_at_ms >= since`. The
   application layer uses a fixed dev window (1 h) — tuning is a policy
   decision, not infra.
4. **Policy packs (domain data, versioned)**: the signal→decision table
   moves from hardcoded `evaluate_signals` into a `PolicyPack` loaded
   from a versioned JSON artifact (`packages/contracts/policy/`). Every
   `Assessment` records `policy_version` so decisions are auditable.
   `evaluate_signals` remains for legacy callers/tests via the built-in
   dev pack.
5. **Ingest escalation**: after storing an event, the service evaluates
   the normalized window; a sequence finding can only *raise* the
   decision floor (never weaken a consent or device check, never execute
   protected actions).

## Consequences
- `EventRepository` gains `list_recent(tenant, principal, since_ms)`;
  implemented in-memory and in Postgres (`observed_at_ms` index added).
- `Assessment` gains `policy_version`; `EventDecision` may carry
  `sequence_findings` for observability.
- Eval harness can replay a labeled corpus through the pack and report
  precision/recall numbers — required before any real sensor data.
- Still synthetic: no real sensors, no ML inference, no provider calls.
