# Threat intelligence (in-process, implemented elsewhere)

Status: **IMPLEMENTED as application/adapters modules** — validated intel
pulls live in `sovir-application` (`pull_intel`, `pull_intel_global`), the
local fixture feed in `sovir-adapters` (`FileThreatIntelFeed`, optional
sha256 pin), durable store via `ThreatIntelStore` (in-memory + Postgres
migration 0010), scheduled by `services/api` via `SOVIR_INTEL_SWEEP_MS` /
`SOVIR_INTEL_TENANT`. Provenance is mandatory; unverified candidates are
dropped; indicators aggregate verified items only.

This directory intentionally holds **no code** — the bounded context is
realized as modules, not a separate worker. Extract only if measurements
justify it.

Original constraints (still binding): ingest only legal and permitted data;
aggregate verified indicators (not individual psychological profiles);
attach provenance and expiry; no automatic labeling of people as malicious
on weak evidence.
