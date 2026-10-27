# ADR-0001 — Hexagonal + modular monolith + monorepo

- Status: Proposed (awaiting human approval)
- Date: 2026-10-27
- Owners: human maintainer + architecture reviewer

## Context
SOVIR must support native OS sensors while retaining shared risk/privacy/inference logic and avoiding provider coupling.

## Decision proposed
Monorepo with Rust domain/application/ports/adapters; app adapters in Kotlin/Swift/Tauri/Browser; backend modules separated by bounded contexts; use event-driven internal processing. Keep service decomposition minimal until scale data justify it.

## Consequences
Shared code and typing improve auditability. Build toolchain complexity, FFI and multi-OS CI require explicit maintenance. Core may not depend on OS/UI/SQL/LLM SDK.

## Verification
Static import boundary checks; contract tests; test case for fake InferenceGateway; dual-platform adapter integration proof.
