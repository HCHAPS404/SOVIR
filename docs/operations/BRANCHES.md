# Ramas y pendiente

El esqueleto local está en `feat/design-foundations-dx01`. Las demás ramas de esta lista se crearon desde el primer commit de `main` y **no contienen** ese esqueleto. No se publican como si ya trajeran el trabajo de frontend.

La fase activa, dicha por el responsable, está en `docs/operations/NEXT_PHASE.md`: frente de la web (landing y consola), frente de la extensión, y arquitectura backend-frontend sobre esas superficies para marcar hitos. Android, iOS y Tauri no son el foco.

## Activa

| Rama | Qué tiene | Pendiente |
|---|---|---|
| `feat/design-foundations-dx01` | Esqueleto, Umbral, catálogo de 16 secciones y 9 estados, CLI, tema claro/oscuro | Cerrar la nota de fase y este mapa. No seguir acumulando aquí el trabajo de web, extensión y backend: eso va en las ramas de abajo, abiertas desde este esqueleto. |

## Fase activa

| Rama | Superficie | Pendiente |
|---|---|---|
| `feat/brand-site-dx03` | Landing `apps/website` | Pulir cada ruta en 1440, 1280, 768 y 390. Medir Core Web Vitals, no inventarlos. Mantener precios y descarga sin cifras ni binarios. Registro y entrar siguen siendo simulación. |
| `feat/web-console-dx04` | Consola `apps/console` | Conectar cada sección del catálogo con un contrato de backend. La sesión demo no es una cuenta. Ajustes no se persisten. |
| `feat/extension-ui-dx05` | Extensión `apps/extension` | Popup, panel y opciones con pausa y permiso opcional por sitio. No observar páginas por defecto. No miniaturizar la consola. Medir el bundle. |
| Rama de backend, aún sin abrir | API local y contratos | Primer contrato que alimente la landing, la consola o la extensión, probado en local. Sin cuentas reales, sin captura del sistema y sin proveedores remotos. |

## Fuera de esta fase

| Rama | Superficie | Pendiente |
|---|---|---|
| `docs/figma-handoff-dx02` | `design/figma/` | El archivo real es [SOVIR Umbral](https://www.figma.com/design/ugk030WRnYLejNPEj0kV0K). Falta un frame por sección y estado. No inventar node IDs. |
| `feat/android-ux-dx06` | `apps/android` | La vista de diseño existe. La compilación sigue en `NOT_IMPLEMENTED` hasta el SDK. |
| `feat/ios-ux-dx06` | `apps/ios` | La vista de diseño existe, con teléfono e iPad. La compilación sigue en `NOT_IMPLEMENTED` hasta macOS y Xcode. |
| `feat/desktop-macos-dx07` | `apps/desktop` | Expresión macOS del shell. Tauri, captura y notarización en `NOT_IMPLEMENTED`. |
| `feat/desktop-windows-dx07` | `apps/desktop` | Expresión Windows. El mismo límite de empaquetado. |
| `feat/desktop-linux-dx07` | `apps/desktop` | Expresiones GNOME y KDE. El portal de captura pertenece al sistema. |
| `test/ui-visual-dx08` | `tests/ui` | Comparar capturas en los anchos del plan cuando la web de esta fase esté estable. |
| `test/a11y-dx08` | `tests/ui` | WCAG 2.2 AA y teclado sobre la UI real de la web y la extensión. El CI visual de DX-09 no es de estas ramas. |

## Regla

Una rama, una intención, luego integración a `main`. No hay una rama permanente `frontend` ni una por sistema operativo.
