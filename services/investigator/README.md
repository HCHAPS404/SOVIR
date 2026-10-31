# Investigator service (in-process, implemented elsewhere)

Status: **IMPLEMENTED as an application module** — the bounded deterministic
investigator lives in `sovir-application` (`run_investigation` /
`list_investigations`), exposed by `services/api` at `POST|GET
/v1/investigations`, persisted via the `InvestigationStore` port (in-memory +
Postgres migration 0012). Facts (proven counts) and hypotheses
(`SequenceFinding`) are kept separate; window capped at 24 h / 512 events; no
model calls, no predictions, no objectives.

This directory intentionally holds **no code** — the service was deliberately
started as an in-process module per the original plan below. Extract it to an
isolated worker only if operational measurements justify it.

Original constraints (still binding for any future worker extraction):
orchestrate bounded, evidence-backed research over approved redacted events;
require consent provenance, strict cost/residency policy, per-tool allowlists,
max-steps, cancellation, prompt-injection isolation, structured explanation
and audit. Provider connectors for Meta, Baseten, Modal and Fireworks must be
separate modules and cannot change policy or consent decisions.
