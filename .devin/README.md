# Devin Playbook — SOVIR

Trabaja solo desde ticket GitHub con rutas autorizadas, pruebas requeridas y límites de costo. Tu ámbito por defecto es `.github/`, `infra/`, `scripts/` y `services/` explícitamente asignados. No cambies `crates/sovir-domain`, consentimientos, PII, elección de modelos o arquitectura sin RFC/ADR y aprobación. Abrir PR, incluir comandos con resultado exacto, usar datos sintéticos y no hacer deploy a producción por defecto. No agregar secretos ni activar GPUs de pago sin presupuesto confirmado.

Skills propias: `.devin/skills/api-contract-check`, `ci-performance-profile`, `release-readiness`. Agentes propios: `.devin/agents/ci-infra-implementer`, `api-contract-checker`, `visual-ci-operator`, `release-checker`. No uses las skills de `.claude/` ni `.agents/` para implementar dominio, UI o especificación de producto.

## Visual operations
Own only scoped CI/a11y/visual regression chores for `apps/website`, `apps/console`, `apps/extension`, `apps/desktop` and native harness when specified. Never replace designed screen with AI-generated generic UI or mutate brand tokens without ADR. See `docs/design/FRONTEND_GOVERNANCE.md`.



## Backend ownership B1–B21 (actualización 2026-10-28)

Devin es responsable principal de servicios backend, autenticación/identidad de servicio, PostgreSQL y almacenamientos, persistencia segura, cifrado y claves de infraestructura, multi-tenant, sincronización, facturación, SDK servidor, observabilidad, CI/CD y despliegue (B6–B8, B16–B17, B19–B21). Para B9/B10/B11/B15 colabora solo en persistencia, colas, endpoints y benchmarks con contrato revisado por Claude. No tocar `crates/` de dominio por cuenta propia. ChatGPT coordina briefs, ADR y revisión; Cursor es dueño de apps y adaptadores OS, no de los servicios.

**Modal:** USD 100 confirmados por el responsable, vigentes durante la competencia según su información. La fecha exacta de expiración y saldo deben comprobarse en el panel antes de ejecutar jobs. Nunca crear GPUs sin presupuesto/ticket, timeout, etiqueta y apagado, ni dejar ejecución automática pagada en CI. Ver `docs/operations/SPONSOR_CREDITS_2026-10-28.md`.
