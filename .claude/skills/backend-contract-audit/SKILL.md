---
name: backend-contract-audit
description: Evaluate hexagonal boundaries, authorization, consent and versioned contracts before backend PR merge.
---
# Backend contract audit
1. Read `README.md`, `docs/backend/BACKEND_MASTER_PLAN.md`, and ADRs.
2. Check schema↔Rust↔OpenAPI fields/serialization, backward compatibility, generated client status.
3. Trace principal/device/source→grant→sensor→event→decision→revocation.
4. Reject path for unknown grant, expired grant, wrong source, replay/duplicate and secret data.
5. Check model usage has hard budgets and no undisclosed provider failover.
6. Run `make backend-check`, record exact commands/results; do not fake success.
7. Flag missing production requirements explicitly, especially authenticated tenant binding.
