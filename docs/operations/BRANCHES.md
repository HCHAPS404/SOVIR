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

## Backend

El plano local ya existe dentro del esqueleto: API de demostración en loopback, concesión, revocación y evento en memoria. No es el servicio de producción. Estas ramas salen de la punta de `feat/design-foundations-dx01` (`3288b64`). No tienen commits propios y no están en origin.

| Rama | Qué es | Pendiente |
|---|---|---|
| `feat/backend-consent-b1` | Identidad, dispositivo y concesión | Atar la concesión a principal, dispositivo, fuente y modalidad. Revocación que corte captura e inferencia. Borrado. Almacén durable. La demo actual acepta un id en el JSON y no tiene cuenta real. |
| `feat/backend-evidence-b2` | Observación | Cabecera de evento inmutable: fuente, tiempo, procedencia. Sin capturas en el log. Grafo temporal y el canal local hacia los adaptadores de cada sistema. |
| `feat/backend-policy-b3` | Riesgo y política | La política decide. El modelo solo propone. Evaluar falsos positivos con fixtures sintéticos. Una hipótesis no bloquea sola. |
| `feat/backend-inference-b4` | Presupuesto y proveedores | Compuertas local, reserva y remoto. El remoto solo con política, cupo y proveedor permitido. Hoy el gobernador es en memoria y no llama a Muse, Baseten, Modal ni Fireworks. |
| `feat/backend-research-b5` | Investigación y auditoría de procedencia | Cola de investigación, fuentes citadas, costo por caso e indicadores verificados. No perfiles psicológicos ni chats privados. |
| `feat/backend-sync-b6` | Aislamiento y organización | Sincronización, copias cifradas, tenant y agregados. Un agregado no es una persona. |
| `feat/backend-billing-b7` | Gasto y endurecimiento | Medir uso, conciliar cupos y facturas. Observabilidad sin el texto de la pantalla. Firmas y revisión de seguridad antes de cualquier despliegue. |

Claude escribe el dominio y los contratos. Devin prepara CI y migraciones en un PR aparte. Cursor conecta la consola cuando el contrato esté congelado. ChatGPT revisa el brief y el costo. Nada de esto se publica en Internet: la demo no tiene autenticación de inquilino ni base de datos.

## Fuera de esta fase

| Rama | Superficie | Pendiente |
|---|---|---|
| `docs/figma-handoff-dx02` | `design/figma/` | El archivo real es [SOVIR Umbral](https://www.figma.com/design/ugk030WRnYLejNPEj0kV0K). Falta un frame por sección y estado. No inventar node IDs. |
| `feat/android-ux-dx06` | `apps/android` | Esta rama sigue en el scaffold inicial y no trae la app. El proyecto Compose está en `feat/design-foundations-dx01`. El APK de depuración compiló; falta instalarlo en un teléfono. |
| `feat/ios-ux-dx06` | `apps/ios` | Esta rama tampoco trae la app. El proyecto SwiftUI está en `feat/design-foundations-dx01`. La compilación sigue en `NOT_IMPLEMENTED` hasta una Mac con Xcode. |
| `feat/desktop-macos-dx07` | `apps/desktop` | Expresión macOS del shell. Tauri, captura y notarización en `NOT_IMPLEMENTED`. |
| `feat/desktop-windows-dx07` | `apps/desktop` | Expresión Windows. El mismo límite de empaquetado. |
| `feat/desktop-linux-dx07` | `apps/desktop` | Expresiones GNOME y KDE. El portal de captura pertenece al sistema. |
| `test/ui-visual-dx08` | `tests/ui` | Comparar capturas en los anchos del plan cuando la web de esta fase esté estable. |
| `test/a11y-dx08` | `tests/ui` | WCAG 2.2 AA y teclado sobre la UI real de la web y la extensión. El CI visual de DX-09 no es de estas ramas. |

## Regla

Una rama, una intención, luego integración a `main`. No hay una rama permanente `frontend` ni una por sistema operativo.
