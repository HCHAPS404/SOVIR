# Design engineering governance y revisión de calidad

## Ownership y trabajo multiagente
| Rol/herramienta | Produce | Puede modificar | Aprueba |
|---|---|---|---|
| **Usuario / dirección creativa** | valores de marca, decisión final, copy crítico, criterio producto | identidad Figma, decisiones ADR | identidad, releases, privacidad |
| **ChatGPT / UX architect** | journeys, IA, screen specs, design critique, test acceptance | docs/design, propuestas Figma por instrucción | no realiza merge ni aprobación de seguridad |
| **Claude / design-system reviewer** | APIs semánticas, interop token/DTO, invariantes UI, revisión de consistencia | `packages/design-system`, `packages/contracts` por ticket | review técnico sin merge final |
| **Cursor / UI implementer** | React/Next/Tauri/WXT, Compose/SwiftUI, tests componentes | apps y `packages/ui-web` en rama asignada | no altera dominio ni tokens aprobados sin ADR |
| **Devin / visual-ops** | Storybook build, snapshots Playwright, axe audit, CI, budgets | `.github`, `scripts`, `tests/ui`, infra preview | no rediseña layouts unilateralmente |
| **Figma / artefactos** | master visual editable, estado, variables, prototipos, handoff | archivo con file owner y edición serializada | no sustituye controles security/privacy |

No hay cambios paralelos sobre el mismo frame Figma o módulo UI. Cada agente posee un ticket, rama corta, rutas permitidas y evidence de Done. Los cambios design tokens requieren aprobación humana y nueva versión semver de paquete. Puede existir equipo especializado de diseño visual que construye dentro de Figma, revisado y firmado por humano.

## Branches frontend (trunk-based, sin ramas persistentes de plataforma)
- `feat/design-foundations-<issue>` / `feat/brand-site-<issue>` / `feat/web-console-<issue>`
- `feat/extension-ui-<issue>` / `feat/android-ux-<issue>` / `feat/ios-ux-<issue>`
- `feat/desktop-macos-<issue>` / `feat/desktop-windows-<issue>` / `feat/desktop-linux-<issue>`
- `test/ui-visual-<issue>` / `test/a11y-<issue>` / `docs/figma-handoff-<issue>`
- Nunca `design`, `frontend`, `ios`, `windows` como ramas perpetuas. Una PR cambia una intención; diferencias OS en carpetas/platform adapters.

## Regla de interacción con pantalla/sensores
Cualquier UI que explique permisos debe mostrar **fuente autorizada**, **alcance real del permiso de OS**, **alcance interno de políticas**, **estado de captura**, **pausa/retirada**, **retención** y **si un proveedor remoto procesará datos**. Previsualizaciones públicas no simulan permisos efectivos. No mostrar protección si sensor está revocado/desconectado.

## QA gates de frontend
1. Diseño: Figma node/review ID + copy + assets licenciados + estados especificados.
2. Función: hook adapter + schema generado + mocks sintéticos; sin seguridad implementada en UI.
3. Accesibilidad: axe (web), teclado, contraste + revisión manual SR, Dynamic Type/TalkBack, high contrast.
4. Visual: snapshots 4 breakpoints web + iOS/Android + tres escritorios; umbral diff definido en snapshot tests, sin aprobar ciegamente screenshots de CI.
5. Rendimiento: bundles, LCP/INP/CLS, render, battery impact; budgets definidos por equipo, medidos por release.
6. Legal & trust: consentimiento claro, exclusión datos sensibles, claims verificados, sin manipulación para aumentar conversión.
7. Release: política de rollback, feature flags, observability sin PII; aprobación humana para cambios críticos.

## Cuadro de mando de calidad
- **UX task success:** usuarios que completan una tarea sin asistencia (por escenario y plataforma).
- **Comprehension:** porcentaje que distingue `evidencia`, `inferencia`, `desconocido` y `protección no disponible`.
- **Accessibility:** defectos graves = 0 para ruta crítica antes de release; reportes manuales pendientes visible.
- **Visual drift:** snapshots aprobados / total, mapeos de componentes actualizados y cobertura de estados.
- **Product performance:** bytes JS + runtime memory + re-render commits + percentiles de latencia UI; sin prometer metas no medidas.

## UI screen release manifest requerido
```yaml
screen: IncidentEvidence
platforms: [web, ios, android, macos, windows, linux]
figma:
  fileKey: pending
  nodeId: pending
states: [loading, verified, uncertain, no-permission, offline, error]
contract: packages/contracts/schemas/observed-event.schema.json
owner: cursor-ui
review: pending-human
privacyReviewed: false
visualBaseline: pending
```
