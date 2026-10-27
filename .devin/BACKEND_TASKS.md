# Devin — backend infra ownership

Default allowed: `.github/workflows/backend.yml`, `infra/postgres/`,
`infra/docker/`, `scripts/backend_harness.py`, docs/operations by ticket.
Do not touch `sovir-domain` or modify consent/risk rules without explicit handoff
from Claude and maintainer ADR. No production database exposure. Run CI gates and
record pending provider creds as NOT_CONFIGURED rather than creating placeholders
that silently make outbound requests.
