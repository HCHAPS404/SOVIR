# SOVIR — Especificación maestra de experiencia y frontend
**Versión:** 0.1 · **Estado:** propuesta para revisión humana · **Alcance:** marca, web pública, consola, navegador, Android, iOS, Windows, macOS y Linux.

> Este documento amplía `README.md` sin sustituir la arquitectura hexagonal del producto. Las interfaces son adaptadores de presentación sobre contratos de aplicación, NO propietarias de reglas de riesgo, consentimiento o precios. Las capturas, cifras, alertas y estadísticas de un prototipo deben estar marcadas como sintéticas cuando lo sean.

## 1. Decisiones de producto y superficies

**Una marca / dos grandes experiencias / siete contextos principales**:
1. **Brand site** (`apps/website`): `www.sovir...`, público, descubrimiento, contenido educativo, comparación de planes, recursos legales y distribución. SEO, CMS opcional y analítica respetuosa; no necesita permisos de Screen Seeker.
2. **Control Center** (`apps/console`): `app.sovir...`, autenticación, onboarding, dispositivos, consentimiento, protección, incidentes, investigaciones, políticas, costes, datos, cuenta. Separar experiencia personal y empresarial mediante roles y navegación; nunca exponer mensajes privados de empleados a un administrador por defecto.
3. **Browser extension** (`apps/extension`): popup estrecho de decisión y estado, side-panel de investigación cuando sea compatible, options page para configuración. No miniaturizar todo el dashboard.
4. **iPhone / iOS** (`apps/ios`): app centrada en claridad, consentimiento de captura, actividad visible, alertas y rutas de verificación. SwiftUI y patrones Apple; no inventar permisos globales que iOS no concede.
5. **Android** (`apps/android`): Compose/Material 3, énfasis en servicios/autorizaciones, fuentes habilitadas y controles de privacidad. Evitar UI que sugiera servicio oculto.
6. **macOS** (`apps/desktop` shell Tauri + adaptadores): menú-bar/status item, controles cercanos a convenciones macOS, barra de herramientas y ventanas redimensionables. Admitir tipografía dinámica/contraste.
7. **Windows** (`apps/desktop` shell Tauri + adaptadores): system tray, navigation rail/panel, dense list/table when relevant, focus/keyboard. Windows-native patterns where possible; no fingir WinUI nativo si se implementa en Tauri.
8. **Linux** (`apps/desktop` shell Tauri + adaptadores): experiencia documentada prioritariamente GNOME/GTK con perfil KDE; system tray variable por entorno, portal de permisos como fuente de verdad. **No** prometer una apariencia idéntica a todas las distribuciones.

**Una misma app shell Tauri en desktop; skins/adapters en interfaz**. No duplicar cinco aplicaciones ni imponer `macOS-look` en Windows. Personalización por sistema operativo y capacidades: título/ventana, atajos, navegación, densidad y uso de bandeja; compartir flujo de negocio, tokens semánticos y primitives adaptables.

## 2. Arquitectura de presentación (hexagonal)

```text
Feature UI (page/view) --> presentation state / view model --> generated typed SDK
                                              |                     |
                              local-only UI   |                     v
                              preferences     |              Application API / Rust Core
                                              v
                                      platform capability adapter
                                   (permission, capture, native dialog)
```

- **Domain state:** `observed-event`, `risk-assessment`, `consent-grant`, `policy-decision`, `research-result`; definido en `packages/contracts` y crates. El frontend solo interpreta el contrato.
- **Presentation state:** `loading`, `empty`, `permission-required`, `limited-coverage`, `degraded-offline`, `success`, `risk-review`, `error`, `revoked`; el UX nunca confunde `no observations` con `protected`.
- **UI tokens:** `packages/design-system/tokens`; **componentes concretos**: `packages/ui-web` (React), Compose components (Android), SwiftUI components (iOS), Tauri shared web UI en `packages/ui-web` con capa `platform`.
- **Puertos de frontend:** `AuthClient`, `ProtectionStatusReader`, `ResearchClient`, `ConsentController`, `ResourceUsageReader`, `PlatformCapabilities`; sin manipular DTOs a mano fuera de adaptadores.
- **BFF/SSR:** `apps/console` Next.js; autenticación en servidor con cookies HttpOnly Secure SameSite; la extensión y los agentes nativos usan flujos de token apropiados a cada plataforma, no comparten cookies a ciegas.
- **No:** llamadas directas a proveedores LLM desde el navegador, secretos en clientes, almacenamiento de capturas sensibles en `localStorage`, scraping cross-origin oculto, presentar protección activa cuando permisos están revocados.

## 3. Esquema de design-system multicapas

- **Layer A / Brand foundations:** logotipo, símbolo, voz y tono, tipografía, color editorial y composiciones de marketing. No gobiernan alertas críticas.
- **Layer B / Cross-platform semantic primitives:** color roles `bg`, `surface`, `text`, `border`, `brand`, `focus`, `success`, `warning`, `danger`, `unknown`; spacing, typography roles, elevation, density, motion, iconography, privacy cues.
- **Layer C / Platform expression:** Apple (iOS/macOS), Material Android, Fluent-inspired Windows, GNOME/KDE-aware Linux, web responsive. Implementación nativa del control siempre que corresponda.
- **Layer D / Feature patterns:** RiskEvidenceCard, ConsentScopePicker, PlatformCoverageMap, ResearchTimeline, DecisionExplanation, ResourceBudgetPanel, OnboardingStepper, InvestigationsTable.
- **Layer E / Screens & flows:** páginas y variantes con cada estado real; prototipos enlazados; sin pantallas huérfanas.

**Regla de consistencia:** reutilizar semántica y comportamiento; **regla de diferenciación:** adaptar controles y layouts a cada OS. `PrimaryButton` en iOS y Android puede ser distinto sin perder significado, estados ni nombre.

## 4. Web pública: marketing y marca con nivel editorial

### Arquitectura de información
- `/` inicio: promesa verificable, diferenciación, video/imagen de producto, seguridad y privacidad, CTA de descarga o acceso.
- `/product` qué observa / qué no observa; control de permisos, evidencia, adaptabilidad.
- `/how-it-works` interacción incremental local, casos de uso con limitaciones, coste/privacidad.
- `/platforms` compatibilidad separada para Android, iOS, Windows, macOS, Linux y extensiones; matriz honesta de cobertura.
- `/security`, `/privacy`, `/trust` modelo de amenaza del propio agente, procesamientos remotos, retención, derechos, políticas.
- `/enterprise` casos B2B/B2B2C, integraciones y gestión agregada sin vigilancia individual.
- `/pricing` únicamente precios aprobados; placeholders no publicados; FAQ transparente.
- `/research` recursos editoriales con fuentes, metodología y fecha; evitar afirmaciones clínicas o eficacia sin estudios.
- `/download` binarios firmados, requisitos OS y hashes cuando existan; no botones falsos.
- `/sign-in` inicia sesión; `app.` es superficie separada autenticada y no se indexa.

### Frontend web y despliegue
- Next.js App Router, TypeScript strict, React, CSS variables/tokens, Tailwind opcional como herramienta y no como diseño, componentes accesibles Radix/React Aria según ADR.
- Public site con SSG/ISR o server-rendered; consola con SSR/BFF y controles de cache privados (`no-store` para datos sensibles).
- Dominios `www` y `app` separados para headers de seguridad, cookies, CSP y observabilidad. Autenticación federada o propia por OIDC con PKCE; protección CSRF cuando aplique, MFA/passkeys como propuesta.
- Contenido de marketing editable mediante repositorio MDX inicialmente; CMS únicamente tras justificarse. Buenas métricas: LCP/INP/CLS, Core Web Vitals; no videos pesados de autoplay que perjudiquen consumo/accesibilidad.
- SEO: metadata real, Open Graph, sitemap, schema apropiado, canonical, indexación restringida en consola, idiomas es/en con revisión nativa.
- Landing NO debe parecer un dashboard. Jerarquía editorial, evidencia concreta, fotografías/diagramas originales con derechos, ilustraciones de producto reales, no métricas inventadas.

## 5. Control Center: producto operativo

Navegación superior/lateral por intención: `Overview`, `Protections`, `Incidents`, `Investigations`, `Devices`, `Permissions`, `Resource Intelligence`, `Account`; en Enterprise, `Policies`, `Aggregates`, `Integrations`, `Audit`, `Billing`, sin exponer datos personales improcedentes.

Pantallas prioritarias y estados:
1. Primer acceso sin dispositivos; permisos pendientes, beneficios y riesgos explicados, elección voluntaria y revocable.
2. Estado general: cobertura por fuente, tiempo desde último evento, conexión del agente, políticas aplicables y huecos de observabilidad.
3. Timeline de evidencia: evento→hipótesis→verificación→recomendación; fuentes y grado de certeza, no porcentajes inventados.
4. Detalle de incidente: contenido minimizado, cadena de evidencia, recomendaciones, falso positivo, reportar, borrar evidencias.
5. Control de permisos: OS authority vs política interna, cuándo expira y qué se analizó; `pause` visible y controles de retención.
6. Investigación: estado `queued/running/verified/uncertain/failed`, coste estimado/real, fuentes citadas, límites y salidas auditable.
7. Presupuesto: tokens API, inferencias locales, CPU/batería si disponibles, límites, explainability de escalamiento.
8. Empresas: agregados con umbrales de privacidad y RBAC, consentimientos separados; nunca monitor de emociones individuales.

## 6. Patrones nativos por plataforma

| SO | Filosofía de interacción | Navegación, componentes | Captura y consentimiento | Recursos/estados |
|---|---|---|---|---|
| iOS | SwiftUI, experiencia táctil Apple | Tab bar apropiada, NavigationStack, sheets, native settings | System picker, indicador y límites iOS; flujos alternos cuando no hay cobertura | Low Power Mode, Dynamic Type, VoiceOver, haptics discretos |
| Android | Material 3 con expresión de marca | Scaffold, navigation bar/rail adaptable, Compose dialogs | MediaProjection permiso por sesión; estado del servicio visible; acceso accesibilidad separado | Battery Saver, TalkBack, density, font scale |
| macOS | Herramienta de escritorio calmada | Sidebar, toolbar, menu-bar accessory, shortcuts, multiple-window | Screen Recording / Accessibility con guías de ajustes | VoiceOver, reduced motion, light/dark OS |
| Windows | Fluent-informed productividad | NavigationView-like, tray, window controls, data grids | Selector oficial / permisos y advertencias honestas | high-contrast, keyboard focus, narrator, scaling |
| Linux | GNOME-first, KDE-aware | HIG-inspired, panel y status UI fallback | XDG Portal ScreenCast; preferencias de compositor | GNOME/KDE dark, DPI, shortcuts, at-spi testing |
| Browser extension | Microinteracción orientada a tarea | Popup con 1 acción primaria; side-panel/Options para complejidad | host_permissions opcionales, pausa por origen | light bundle, no tracking, keyboard navigation |

No utilizar UI multiplataforma para **simular** diálogos de permisos del SO. Las ventanas nativas para consentir deben ser genuinas. El shell Tauri es una decisión de implementación, no permiso para ignorar expectativas OS.

## 7. Layouts de Figma y diseño responsivo

- **Marketing:** desktop 1440, laptop 1280, tablet 768, mobile web 390 / 360; responsive basado en contenido, no solo escalado. Definir tokens `container/max`, gutters, grids.
- **Web app:** 1440, 1024, 768, 390; tablas se reorganizan en vistas resumidas móviles; no scroll horizontal accidental.
- **Extension:** popup 360×540 de referencia; opciones a ancho adaptable, sidepanel mínimo 400 si host lo permite.
- **iPhone:** ancho 393pt de referencia, y pruebas 375/430 + Dynamic Type; safe areas y tab bar reales.
- **Android:** 412dp de referencia, compact/medium/expanded window size classes (teléfono, plegable, tablet), tamaño de fuente aumentado.
- **macOS:** 1280×800 de referencia con min-size razonable y menu-bar popover.
- **Windows:** 1366×768 de referencia, pruebas 125%/150% DPI, ventanas estrechas y high contrast.
- **Linux:** 1280×800 GNOME y 1366×768 KDE; portal dialogs pertenecen al compositor y se documentan sin falsificar.

Crear variantes por `platform`, `theme`, `density`, `state`, `permission`, no un frame por cada combinación posible; diseñar componentes/props reutilizables. Los prototipos reflejan rutas reales, y las capturas deben mostrar `synthetic` donde aplique.

## 8. Accesibilidad y experiencia ética: criterios obligatorios

- **WCAG 2.2 AA** como meta para web, más VoiceOver/TalkBack/Narrator/AT-SPI y convenciones nativas. Los mínimos mecánicos NO sustituyen pruebas con usuarios.
- Contraste texto normal >=4.5:1; grande >=3:1, foco visible, navegación de teclado y etiquetas accesibles.
- Controles táctiles conforme a estándares nativos de Apple/Android; respetar ajustes de accesibilidad.
- Motion reducido, estados sin depender únicamente de color, no animaciones obligatorias, sin autoplay intrusivo.
- Tratamiento de alertas: observación vs inferencia vs verificación externa vs recomendación; mostrar incertidumbre y enlaces a evidencia.
- Consentimiento granular, sin prechecks engañosos, posibilidad de revocación; sin puntuaciones psicológicas individuales ni manipulación.
- Microcopy: preciso, calmado, acción clara y reversible; evitar lenguaje alarmista, ansiedad inducida o señalamientos personales no probados.
- Todas las pantallas deben incluir loading/empty/error/offline/permission-denied/limited-data, conforme aplique.

## 9. Barra de calidad contra «AI slop»

Prohibido entregar como diseño final: fondos de gradiente violeta/cian por defecto; resplandores sin significado; tarjetas repetidas para rellenar; iconos decorativos irrelevantes; dashboards con métricas falsas; titulares ambiguos; 3D stock de candados; exceso de esquinas redondeadas indiferenciadas; misma sidebar en móvil y escritorio; contrastes bajos; páginas sin contenido real; y prompts que hagan pasar imágenes renderizadas por componentes editables.

Obligatorio demostrar **racional de composición**: tipografía y escala intencional, ritmo entre secciones, densidad informativa adecuada, iconografía consistente, jerarquía visual que siga tareas reales, estados suficientes, contenido concreto y accesibilidad. Revisar con screenshots en tamaños objetivo, UI audit por pares y un benchmark competitivo sin copiar.

## 10. Inventario de Figma

Propuesta de un archivo de design system `SOVIR / Foundations & Components` y un archivo de producto `SOVIR / Product Experiences`. Si disponibilidad/licencia no permite múltiples archivos, usar páginas: `00 Cover`, `01 Brand Explorations`, `02 Foundations`, `03 Components`, `04 Web Brand`, `05 Web Console`, `06 Browser`, `07 iOS`, `08 Android`, `09 macOS`, `10 Windows`, `11 Linux`, `12 Prototypes`, `13 Handoff`, `99 Archive`.

**Componente**: dueño, descripción, tokens enlazados, variantes (size/state/intent), min-width/density, accesibilidad, estados, links a issue + código; **pantalla**: Figma node ID, spec de plataforma, flujo, source de contenido, permisos, estados, revisión humana.

Code Connect: usar integración oficial si acceso/licencia lo permite. Plantillas de mapping recomendadas; no asumir que el plan conectado tiene permiso de edición o Code Connect habilitado. En su defecto, manifest manual de correspondencias en `design/figma/screen-manifest.json` y docs.

## 11. Proceso de diseño y aprobación

**Discovery** (personas/tareas/observación) → **Concepts** (3 direcciones de marca) → **Design Tokens** (aprobación humana) → **Task flows** → **Wireframes** → **High-fidelity Figma** → **Prototype** → **Critique** → **Platform accessibility** → **UI contract** → **Code implementation** → **Visual regression** → **Release**.

Figma no dicta lógica de seguridad; el dominio y contratos no dictan estética. La frontera la define el mapeo de estados y acciones aprobado. Se puede avanzar con tokens provisionales pero **no publicar identidad/logo final sin aceptación humana**.

## 12. Métricas y artefactos de verificación

UX: completion rate de consentimiento informado; entendimiento de permisos; éxito en localizar evidencia y revocar acceso; tareas de usuario; severidad de errores; tasa de cierre de alertas; reducción de interrupciones irrelevantes.
UI: contraste, teclado, lector de pantalla, densidad, responsividad, tests de componentes, screenshot diff, snapshot semántico, performance web y native startup.
Marketing: LCP/INP/CLS, descubrimiento orgánico, claridad del posicionamiento, conversión legítima sin dark patterns; no colectar más datos para optimizar conversión.
Ownership: marketing+identity | console UX | mobile-native | desktop-shell | extension microinteraction | design tokens/library son áreas de cambio separadas.

## 13. Scope de implementación y entrega

| Hito | Entregable (sin fingir implementación) | Prueba de salida |
|---|---|---|
| DX-01 | Brand routes, voz, logo briefs, tokens base | decisión registrada + licencias verificadas |
| DX-02 | Figma foundation, variables, componentes | audit de instancias/estados/contraste |
| DX-03 | Marketing responsive, copy, páginas de privacidad | usability, SEO y Core Web Vitals |
| DX-04 | Consola Personal/Enterprise, data states | WCAG, mock services, auth boundaries |
| DX-05 | Extension popup/panel/options | permisos host, keyboard, bundle |
| DX-06 | iOS y Android patrones nativos | permisos reales simulados y testeados en dispositivo |
| DX-07 | macOS/Windows/Linux skins y adaptadores | DPI, teclado, screen reader, compositor |
| DX-08 | Code Connect/manual manifest + visual QA | mapping Figma→código, screenshot diff |
| DX-09 | Design operation/CI y roadmap escalado | metrics, ADRs, roles, gate de merge |

**Fuentes de referencia para revisar al implementar:** Apple HIG, Android Material 3, Microsoft WinUI/Fluent, GNOME HIG, KDE HIG, WCAG 2.2, Figma Code Connect. No asumir que los design systems de referencia proporcionan licencias para copiar componentes exactos sin condiciones.
