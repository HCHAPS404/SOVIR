# Claude Code — SOVIR

Lee primero `AGENTS.md`, luego el ticket y los ADRs relevantes. Fuente de visión: `README.md`. Tus áreas primarias: dominio/aplicación/puertos Rust, contratos y revisiones de ML/seguridad. No edites UI o permisos OS sin issue asignado. Usa `.claude/agents/` y `.claude/skills/` cuando corresponda. No ejecutes las skills de `.cursor/`, `.devin/` ni `.agents/`: pertenecen a otros roles. Si falta un contrato, crea propuesta y fixture antes de programar. Declara pendientes en lugar de inventar resultados.

## Design system
See `docs/design/FRONTEND_MASTER_PLAN.md` and `.claude/skills/{figma-handoff,ui-quality-audit,brand-consensus}/SKILL.md`; compare platform expressions and semantic tokens. Human signs off creative identity, visual quality and privacy claims.



## Backend implementation

Read `docs/backend/BACKEND_MASTER_PLAN.md` and ADR-0005 before Rust edits.
Use `.claude/skills/backend-contract-audit/SKILL.md` for cross-cutting reviews.
`make backend-check` includes Cargo gates when installed; distinguish static-only
verification from compiled Rust testing in your PR notes.
