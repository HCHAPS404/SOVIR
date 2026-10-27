# Operación Figma — Workspace, páginas, fuente de verdad y handoff
**Estado:** workflow acordado en principio; archivo Figma aún no creado ni vinculado. El usuario debe elegir workspace entre los disponibles y contar con permisos de edición.

## Archivo 1: `SOVIR — Brand & System` (biblioteca)
`00 README`, `01 Concepts`, `02 Color & Typography`, `03 Tokens`, `04 Primitives`, `05 Web Components`, `06 Native Mapping`, `07 Interaction Patterns`, `08 Accessibility`, `09 Brand Assets`, `99 Archive`.

## Archivo 2: `SOVIR — Product Experiences`
`00 Sitemap & Flows`, `01 Marketing`, `02 Public Responsive`, `03 Auth`, `04 Control Center Personal`, `05 Control Center Enterprise`, `06 Browser Extension`, `07 iOS`, `08 Android`, `09 macOS`, `10 Windows`, `11 Linux GNOME`, `12 Linux KDE`, `13 Prototypes`, `14 QA & Handoff`, `99 Archive`.

## Component architecture
- Design foundation → aliases semantic tokens → platform variant tokens → patterns → screens.
- Slots & content props, variants `Size`, `Intent`, `State`, `Platform`; `Focus`, `Loading`, `Disabled`, `Empty`, `Error`, `PermissionsDenied`.
- Figma auto-layout, variables mode Light/Dark; typography styles; responsividad comprobable y componentes editables. No guardar páginas como única imagen plana.
- Nomenclatura: `Feature / Platform / Screen / State / Width` p.ej. `Research / iOS / Evidence detail / uncertain / 393`.
- Annotate decisiones que no se leen de un mockup: teclado, VoiceOver/TalkBack, permiso del SO, escape/back, no-network, resource usage.
- Las instancias muestran texto ficticio claramente etiquetado donde se usan ejemplos sintéticos.

## Fuente de verdad
- **Producto/seguridad:** `README`, ADR, dominio Rust, contratos.
- **Marca y composición:** archivo Figma aprobado + tokens versionados. En conflicto, ADR y aprobación del usuario.
- **Estilo programático:** `packages/design-system/tokens` sirve como source for codegen tras freeze de identidad; variables Figma se sincronizan por mapeo y se auditan por diffs.
- **UI API:** contrato de componentes + Storybook / Compose previews / SwiftUI previews.
- **No se considera terminado** hasta que screen manifest tiene `fileKey`, `nodeId`, revision, owner y test snapshot.

## Handoff PR
1. URL nodo Figma y snapshot aprobado.
2. Estado y copy exactos, variantes responsive/platform, tokens usados.
3. Contratos de backend, fixtures sintéticos, permisos y fallbacks.
4. Tests obligatorios de teclado/lector de pantalla, responsive, contrastes y permisos.
5. Diferencias justificadas Figma↔implementación registradas, no «me parece igual».
6. No importar una captura como sustituto de layers; UI editable en Figma.

## Cadencia
- Primera revisión: arquitectura info + wireframes (usuario).
- Segunda: rutas de marca y diseño system (usuario).
- Tercera: prototypes por plataforma y estados (usuario+Claude UX review).
- Cuarta: handoff a Cursor + pruebas; Devin añade CI visual/a11y; ChatGPT mantiene spec y checks.

## Limitaciones actuales de Figma
La conexión puede ofrecer acceso en modo View; no prometer escritura antes de verificar tipo de asiento. Si hay dos equipos, el usuario elige. Code Connect y publicación de biblioteca requieren capacidad acorde al plan; alternativa: manifest + captura semántica + tokens exportados. Un archivo nuevo sin componentes aprobados sigue siendo un *draft*.
