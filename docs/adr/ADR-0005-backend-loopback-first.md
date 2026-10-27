# ADR-0005 — Backend bootstrap: hexagonal core + loopback-only demonstration

- Status: Proposed; requires human acceptance before any public deployment.
- Context: Existing design scaffold contains architecture directories but no executable backend.
- Decision: Cargo workspace with `domain → ports → application`, infrastructure adapters,
  budget governor, Axum loopback service. Default is no model calls and only synthetic metadata.
- Constraints: No cross-tenant production API; never process raw secrets or private-screen captures.
- Decision boundary: Replacing in-memory repositories with a production DB or enabling cloud inference
  requires separate ADR and security/privacy review.
- Acceptance: `make backend-check`; live demo can grant → ingest → revoke → deny.
- Open questions: identity/OIDC and tenant binding, audit schema, RLS policies,
  distributed revocation consistency, model provider contract, local IPC/FFI and retention.
