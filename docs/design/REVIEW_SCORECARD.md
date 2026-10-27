# Revisión profesional de UI/UX — scorecard
Cada criterio 0=no diseñado, 1=parcial, 2=implementado y probado. Aprobación humana obligatoria. No usar suma global para omitir fallos críticos.

| Eje | Evidencia mínima | Severidad de incumplimiento |
|---|---|---|
| Claridad de trabajo | un flujo significativo testeado con usuario | P1 |
| Diferenciación de marca | racional + assets originales + coherencia multi-plataforma | P2 |
| Accesibilidad | keyboard/SR/contrast/Dynamic Type | P0/P1 |
| Consentimiento | permisos OS claros, revocación fácil, cobertura real | P0 |
| Veracidad | hechos/hipótesis/evidencia, no métricas inventadas | P0 |
| UX responsive/nativa | artefactos y pruebas por plataforma | P1 |
| Estados y errores | empty/offline/revoked/failed/loading | P1 |
| Privacidad | logging, cache, PII y estados de datos auditados | P0 |
| Rendimiento | bundle/web vitals/render/memory medidos | P1/P2 |
| Consistencia design-code | Figma + code connect/manifest + diff QA | P2 |

**Gate obligatorio:** Cualquier P0 abierto impide release. Un P1 sobre tarea crítica bloquea release. Los cambios de identidad no se autoaprueban por agentes.
