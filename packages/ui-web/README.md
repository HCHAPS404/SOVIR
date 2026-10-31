# SOVIR UI Web — futura biblioteca React accesible

**No implementada.** La organización de capas está en `STRUCTURE.md`. Los roles semánticos aún no tienen valores: la marca no está aprobada.

Consumirá tokens de `packages/design-system/tokens` y exportará Button, Field, Dialog, Tooltip, Status, EvidenceCard, PermissionScope, IncidentTimeline y patterns según contract. Será utilizada en `apps/website`, `apps/console` y `apps/desktop` con skins nativas específicas. Extensión comparte tokens y primitives pequeñas; no arrastrar el bundle completo. Todos los componentes llevan Storybook stories, a11y, states, visual tests y referencia Figma cuando se disponga de ella.
