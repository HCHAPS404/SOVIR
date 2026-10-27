---
name: architecture-review
description: Audit Rust hexagonal boundaries, contracts and ADR compliance
---

Read AGENTS.md and README.md before starting. Run only approved commands, never real API calls by default. Use these steps:

1. Read AGENTS.md and ADRs. 2. Identify modified domains/ports. 3. Check import direction and versioned schemas. 4. Demand tests and approval for contract changes.

Output: findings with paths, severity, evidence, commands actually run, unresolved risks and an actionable PR checklist.
