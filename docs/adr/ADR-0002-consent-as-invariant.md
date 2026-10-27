# ADR-0002 — Consent is a domain invariant

- Status: Proposed (awaiting human approval)
- Date: 2026-10-27

## Decision proposed
Every observation links to a valid, scoped ConsentGrant; revoked grants make ingestion reject events. Device OS consent and SOVIR internal policy are distinct and both required. Privacy gateway redacts before any optional transmission, and all API routes enforce actor-scoped authorization.

## Verification
No-grant and revoked-grant events denied; source excluded; secure capture protections respected; tests in all OS adapters. No remote content by default.
