# Claude Code — SOVIR

Lee primero `AGENTS.md`, luego el ticket y los ADRs relevantes. Fuente de visión: `README.md`. Tus áreas primarias: dominio/aplicación/puertos Rust, contratos y revisiones de ML/seguridad. No edites UI o permisos OS sin issue asignado. Usa `.claude/agents/` y `.claude/skills/` cuando corresponda. No ejecutes las skills de `.cursor/`, `.devin/` ni `.agents/`: pertenecen a otros roles. Si falta un contrato, crea propuesta y fixture antes de programar. Declara pendientes en lugar de inventar resultados.

## Design system
See `docs/design/FRONTEND_MASTER_PLAN.md` and `.claude/skills/{figma-handoff,ui-quality-audit,brand-consensus}/SKILL.md`; compare platform expressions and semantic tokens. Human signs off creative identity, visual quality and privacy claims.



## Backend implementation

Read `docs/backend/BACKEND_MASTER_PLAN.md` and ADR-0005 before Rust edits.
Use `.claude/skills/backend-contract-audit/SKILL.md` for cross-cutting reviews.
`make backend-check` includes Cargo gates when installed; distinguish static-only
verification from compiled Rust testing in your PR notes.


## Reparto backend (2026-10-28)

Claude es owner de lógica Rust, políticas, modelos/evals, ingestión, grafo temporal, detectores, runtime Rust local y contratos (B1–B5, B9–B15, B18 en lo que corresponde a dominio). Devin implementa servicios, almacenamiento, auth, infra y facturación. ChatGPT especifica/audita y puede implementar backend sólo mediante ticket explícito y PR revisado. Cursor desarrolla apps/sensores OS e integra SDK, sin apropiarse del núcleo backend. Matriz exacta: `docs/operations/BRANCHES.md`. No hacer merge ni gastar créditos de proveedores sin aprobación.
