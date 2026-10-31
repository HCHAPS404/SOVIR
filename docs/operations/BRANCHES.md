# Ramas y pendiente

El esqueleto integral está en `feat/design-foundations-dx01`. **Situación verificada el 28 oct 2026:** las ramas B1–B21 y esa rama comparten el commit `84ebf5581538c68d515e34e2e1493cd4f496c53d`. `main` está en `526604937d66566f38f879419b5eaa9e15348f8c` y todavía no integra esa fundación. Ninguna de las 21 ramas contiene implementación propia diferenciada por dominio; las ramas no equivalen a módulos terminados.

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

## Backend — registro B1–B21 (verificado 2026-10-28)

**Estado Git verificado:** B1–B7 ya existían; B8–B21 fueron creadas en GitHub desde el SHA exacto `84ebf5581538c68d515e34e2e1493cd4f496c53d`, compartido por las siete originales. **Todos los nombres son ramas Git reales; las implementaciones individuales siguen pendientes.** No se han fusionado cambios a `main` ni se han modificado las siete ramas originales.

La siguiente matriz es un **mapa de propiedad de dominios**, NO una instrucción de mantener 21 ramas de larga duración. Antes de empezar desarrollo en cualquiera, revisar el PR de integración de la fundación hacia `main`; actualizar la rama de trabajo desde `main` una vez integrada la base, sin forzar actualizaciones ni sobreescribir cambios.

| ID | Rama en GitHub | Responsabilidad | Prioridad | Responsable principal |
|---|---|---|---|---|
| B1 | `feat/backend-consent-b1` | Consentimiento granular, revocación y trazabilidad | P0 | Claude |
| B2 | `feat/backend-evidence-b2` | Evidencias, procedencia y eventos inmutables | P0 | Claude |
| B3 | `feat/backend-policy-b3` | Políticas, decisiones e invariantes de autonomía | P0 | Claude |
| B4 | `feat/backend-inference-b4` | Inferencia local/remota, modelos, tokens, caché y presupuestos | P0 | Claude |
| B5 | `feat/backend-research-b5` | Investigación, corroboración y fuentes auditables | P0 | Claude |
| B6 | `feat/backend-sync-b6` | Sincronización cifrada, conflictos y copias opcionales | P1 | Devin |
| B7 | `feat/backend-billing-b7` | Consumo facturable, cuotas, planes y conciliación | P1 | Devin |
| B8 | `feat/backend-identity-b8` | Identidad, autenticación, sesiones, MFA y autorización | P0 | Devin |
| B9 | `feat/backend-devices-b9` | Registro, capacidades y confianza de dispositivos | P0 | Claude (dominio de dispositivos); Devin (persistencia/servicio) |
| B10 | `feat/backend-ingestion-b10` | Normalización, validación y deduplicación de señales autorizadas | P0 | Claude (ingestión y validación); Devin (adaptador API) |
| B11 | `feat/backend-edge-runtime-b11` | Núcleo local, FFI/IPC, colas y control CPU/GPU/RAM/batería | P0 | Claude (runtime Rust); Devin (benchmarks/CI) |
| B12 | `feat/backend-context-graph-b12` | Grafo temporal y correlación justificable de evidencias | P0 | Claude |
| B13 | `feat/backend-threat-detection-b13` | Detectores de fraude, manipulación, privacidad y bienestar observable | P0 | Claude |
| B14 | `feat/backend-predictive-ml-b14` | Modelos temporales, evaluación, calibración y deriva | P1 | Claude |
| B15 | `feat/backend-intervention-b15` | Alertas y acciones preventivas autorizadas | P0 | Claude (lógica y protocolo de intervención); Devin (servicio/colas) |
| B16 | `feat/backend-data-governance-b16` | Minimización, clasificación, retención, exportación y borrado | P0 | Devin |
| B17 | `feat/backend-security-b17` | Cifrado, claves, integridad, aislamiento y hardening | P0 | Devin (revisión independiente) |
| B18 | `feat/backend-threat-intelligence-b18` | Indicadores corroborados y campañas agregadas sin datos íntimos | P1 | Claude |
| B19 | `feat/backend-enterprise-b19` | Organizaciones, RBAC, aislamiento multi-tenant y B2B | P1 | Devin |
| B20 | `feat/backend-integrations-b20` | SDKs, APIs, webhooks y conectores autorizados | P1 | Devin (APIs/SDK de servidor); Claude (contratos) |
| B21 | `infra/backend-platform-b21` | CI/CD, persistencia, despliegue, observabilidad y continuidad | P0 | Devin |


### Gobierno backend confirmado para trabajo multiagente (2026-10-28)

**Decisión del responsable:** todo el trabajo de *lógica, servicios, persistencia, inferencia, seguridad, algoritmos y runtime Rust* del backend se distribuye entre **ChatGPT, Claude Code y Devin**, con tickets delimitados y revisión cruzada. Cursor se mantiene en **frontend, Figma handoff, apps nativas, adaptación a APIs del sistema, sensores del dispositivo, clientes tipados y puente UI↔backend**, pero **no es dueño ni modifica unilateralmente el backend**.

- **Claude:** implementación predominante de `crates/`, puertos, dominio, policy, ingestión, runtime Rust, grafo, detectores, evaluación ML y contratos; no configura infraestructura sin ticket.
- **Devin:** implementación de `services/`, `infra/`, autenticación servicio, almacenamiento, cifrado, despliegue, observabilidad, CI/CD, quotas durables, APIs y billing, con auditoría de privacidad.
- **ChatGPT:** arquitectura técnica, diseño de contratos, ADR, escenarios de prueba y criterios de aceptación; puede proponer o realizar implementaciones backend específicas **solo con ticket y rutas asignadas**, siempre en PR revisable, sin cambios silenciosos ni merge autónomo.
- **Cursor:** `apps/`, `packages/ui-*`, extensión, integración de sensores OS y renderizado de intervenciones. Puede consumir SDKs/contratos backend aprobados; si un cambio requiere modificar `crates/` o `services/`, debe solicitar ticket al propietario correspondiente.
- **Humano responsable:** aprueba el diseño, acceso a datos y proveedores, permisos del sistema, gastos, merges y releases. No se fusiona este PR documental automáticamente.

**Límite de ownership:** B9 incluye el dominio/servicio de registro de dispositivo, no el código de permisos nativos; B10 ingiere eventos, pero Cursor implementa la captación en apps; B11 contiene el motor Rust local mientras Cursor implementa los adaptadores Swift/Kotlin/Windows/Linux; B15 define decisiones en backend y Cursor presenta las alertas; B20 define las APIs del servidor mientras Cursor desarrolla sus clientes. Toda colaboración cruza límites solo mediante contratos versionados y PRs revisados.

**Reglas obligatorias de integración**

1. Un dominio no implica microservicio: monolito modular + hexagonal; plano local distinto del plano de servicios.
2. Cada issue delimita contrato, rutas de archivos propietarias, dependencias, permisos, pruebas y métricas; nadie cambia interfaces compartidas unilateralmente.
3. Identidad (B8) y consentimiento (B1) deben proteger ingestión (B10); eventos B2 alimentan contexto B12; detectores B13 emiten hipótesis; las políticas B3 autorizan intervenciones B15. El LLM no toma decisiones de bloqueo.
4. B4 reserva y liquida presupuestos de tokens, con límites de gasto independientes de B7. B16/B17 gobiernan todos los dominios.
5. Pruebas: cargo fmt, clippy, tests, contratos, autorización/revocación, casos adversos, benchmarks de recursos/latencia/costo según módulo. Sin evidencia reproducible, una rama no está terminada.
6. Integrar un corte vertical temprano: fuente autorizada → revocación → ingesta → evidencia → contexto → detección → política → intervención. Sin transmisión de capturas por defecto.
7. Trabajar en PRs pequeños desde `main` actualizado cuando la fundación esté integrada; los nombres B1–B21 son reservas organizativas existentes y se pueden reemplazar por ramas efímeras por issue cuando corresponda.
8. Prohibido subir conversaciones, capturas reales, secretos, tokens o credenciales al repositorio; usar fixtures sintéticos y controles de privacidad.

**Registro de creación:** `docs/operations/BACKEND_BRANCH_CREATION_LOG_2026-10-28.md`. No se creó ningún servicio de producción ni se publicaron APIs por este cambio.

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
