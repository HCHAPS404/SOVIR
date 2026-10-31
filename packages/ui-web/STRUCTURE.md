# Estructura gráfica de SOVIR

Estado: Umbral es la identidad final del esqueleto, definida el 27 de octubre de 2026. El símbolo está en `brand/sovir-symbol-white.png`. Paleta, tipografía y rol `brand` están en `layers/semantic-roles.json`.

El orden es fijo: marca, tokens semánticos, expresión de plataforma, patrones, pantallas. Una pantalla no elige colores ni decide riesgo.

## Capas

| Capa | Dónde vive | Qué se puede hacer ahora |
|---|---|---|
| Marca | `packages/design-system/tokens/brand-candidates.json` y `brand/` | Símbolo blanco recibido. Mineral, Cartográfica y Editorial siguen sin elegir. |
| Roles semánticos | `layers/semantic-roles.json` | Claro y oscuro provisionales. `brand` sigue nulo. |
| Expresión de plataforma | `layers/platform-expressions.json` | Qué carpeta y qué convención usa cada superficie. |
| Patrones | `packages/design-system/component-contracts.json` | Catálogo ya especificado. No hay componentes React. |
| Pantallas | `design/figma/screen-manifest.json` | Inventario con `approval: pending`. |

## Superficies que implementa Cursor

- Sitio público: `apps/website`. Mapa en `INFORMATION_ARCHITECTURE.md`.
- Consola: `apps/console`. Mapa en `INFORMATION_ARCHITECTURE.md`.
- Primitivas web compartidas, cuando existan: `packages/ui-web`.

iOS, Android y el shell de escritorio comparten los mismos roles semánticos y no copian el layout web. Sus pantallas siguen en el manifiesto, con implementación nativa más adelante.

## Estados de presentación

`loading`, `empty`, `permission-required`, `limited-coverage`, `degraded-offline`, `success`, `risk-review`, `error`, `revoked`.

`empty` no significa protegido. `revoked` no se dibuja como cobertura activa.

## Siguiente paso de esta rama

Tu elección de una ruta visual. Hasta entonces no se congelan tokens, no se crea el proyecto Next.js y no se dibujan pantallas.
