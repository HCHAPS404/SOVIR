---
name: figma-handoff
description: Revisa el handoff Figma→frontend, variantes y contratos. Úsala antes de implementar pantallas.
---

1. Leer `docs/design/FIGMA_WORKFLOW.md` y `FRONTEND_MASTER_PLAN.md`.
2. Identificar fileKey/nodeId *existentes* y el estado de aprobación; si no existen, marcar bloqueo de diseño, no inventarlos.
3. Validar componentes editables, tokens semánticos, copies, states, breakpoints, permisos OS.
4. Mapear a `apps/website|console|desktop|extension|android|ios` y contrato en `packages/contracts`.
5. Emitir acceptance checklist con fallos y dependencias.
6. Rechazar pantallas rasterizadas usadas como diseño fuente; aceptar screenshots únicamente para referencias visuales.
