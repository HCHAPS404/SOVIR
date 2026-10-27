# ADR-0003 — Frontend como plataforma de experiencias, sistema semántico compartido y expresión nativa
**Status:** PROPOSED — requiere aprobación humana de identidad y prototipos.

## Contexto
SOVIR se desplegará en web de marca, consola, extensión, Android, iOS, macOS, Windows y Linux. Copiar una sola pantalla en todas las plataformas causaría diferencias de accesibilidad, navegación y permisos, y debilitaría diferenciación de marca.

## Decisión propuesta
Una marca + tokens semánticos + contratos de interacción compartidos, con implementación y diseño específicos por plataforma. Next.js para web pública/console, SwiftUI y Compose para mobile, shell Tauri/React con platform skins y adaptadores en escritorio, WebExtensions para navegador. Pantallas comparten journeys y semántica, no componentes visuales idénticos.

## Trade-offs
Más trabajo de diseño y validación frente a consistencia superficial. Menos duplicación de lógica de negocio y mejor calidad OS. La separación brand/public y app/auth añade despliegues, pero aísla indexación, cookies, CSP y procesos.

## Guardrails
No lógica de riesgo en React/SwiftUI/Compose; prohibidos reclamos de cobertura falsa, dark patterns, permisos simulados, diseñar en frames rasterizados, infundir miedo para conversión o usar colores de marca como evidencia de peligro. Tokens provisionales hasta dirección elegida.

## Consecuencias
Agregar `apps/website`, `packages/ui-web`, `design/figma`, `docs/design`, y reglas/harness específicos. `apps/console` se mantiene. No se implementa en este ADR código frontend.
