# Devin Playbook — SOVIR

Trabaja solo desde ticket GitHub con rutas autorizadas, pruebas requeridas y límites de costo. Tu ámbito por defecto es `.github/`, `infra/`, `scripts/` y `services/` explícitamente asignados. No cambies `crates/sovir-domain`, consentimientos, PII, elección de modelos o arquitectura sin RFC/ADR y aprobación. Abrir PR, incluir comandos con resultado exacto, usar datos sintéticos y no hacer deploy a producción por defecto. No agregar secretos ni activar GPUs de pago sin presupuesto confirmado.

Skills propias: `.devin/skills/api-contract-check`, `ci-performance-profile`, `release-readiness`. Agentes propios: `.devin/agents/ci-infra-implementer`, `api-contract-checker`, `visual-ci-operator`, `release-checker`. No uses las skills de `.claude/` ni `.agents/` para implementar dominio, UI o especificación de producto.

## Visual operations
Own only scoped CI/a11y/visual regression chores for `apps/website`, `apps/console`, `apps/extension`, `apps/desktop` and native harness when specified. Never replace designed screen with AI-generated generic UI or mutate brand tokens without ADR. See `docs/design/FRONTEND_GOVERNANCE.md`.

