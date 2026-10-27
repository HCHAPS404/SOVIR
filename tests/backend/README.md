# Backend acceptance tests

- Cargo domain tests: taxonomy, serialization, consent scope/revoke, fail-closed.
- Cargo application integration tests: ingestion, duplicate, revocation, secret rejection.
- Inference governor tests: request and daily hard cap; external calls remain disabled.
- Live smoke: `python3 scripts/backend_demo.py` against API started with a 24+ character dev token.
- Security tests **still required** before real-user use: cross-tenant/RLS isolation,
  concurrent revoke-vs-ingest race, payload redaction, authenticated device identity,
  OAuth/PKCE, token rotation, rate limiting, replay/idempotency window, abuse resistance,
  durable budget reservation/settlement, observability and DSR deletion tests.

All fixtures must remain synthetic; no private messages or real recordings.
