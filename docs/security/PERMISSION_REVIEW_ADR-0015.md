# Revisión de permisos — paquete para aprobación humana de ADR-0015

**Estado:** preparado para revisión humana. Este documento NO autoriza
permisos nuevos ni sustituye la firma del maintainer (invariante 8).
Auditoría hecha sobre el código real, no sobre la intención.

## Inventario de permisos declarados hoy

| Superficie | Permiso / entitlement | API del sistema real | Estado | Evidencia |
|---|---|---|---|---|
| `apps/extension` | `storage`, `scripting`; `host_permissions: http://127.0.0.1:8787/*` únicamente | `chrome.scripting` + `chrome.storage` | **Implementado** — extracción DOM en content scripts registrados por sitio concedido | `apps/extension/manifest.json` |
| `apps/android` | `BIND_ACCESSIBILITY_SERVICE`, `INTERNET` | `AccessibilityService` con `typeWindowStateChanged`+`typeWindowContentChanged`, `canRetrieveWindowContent="true"` | **Implementado** — `SovirAccessibilityService.kt` + `SignalExtractor` existen | `AndroidManifest.xml`, `res/xml/sovir_accessibility_service.xml` |
| `apps/ios` | Ninguno de captura/sensores | — | Limpio (solo display name, fonts, orientations, encryption declaration) | `apps/ios/Sovir/Info.plist` |
| `apps/desktop` | Ninguno — shells HTML mockup | — | **NOT_IMPLEMENTED** (mockups de diseño intencionales) | `apps/desktop/` |
| `services/observer` (Windows) | Ninguno adicional hoy | `GetForegroundWindow`/`GetWindowText` — **metadatos de ventana, no píxeles** | Implementado; no requiere permiso de captura | `services/observer/src/main.rs` |

## El permiso que ADR-0015 propone (requiere aprobación)

| Superficie | API propuesta | Qué exige el sistema | Separación permiso OS vs SOVIR |
|---|---|---|---|
| Windows capture | `Windows.Graphics.Capture` (GraphicsCaptureSession) | Diálogo de consentimiento del sistema por frontera de captura (border); **no permite captura silenciosa** | El diálogo del OS concede la captura a nivel proceso; el consentimiento SOVIR (`consent grant` por `source_id`) es independiente y obligatorio encima — un diálogo dibujado en la app NO sustituye al del sistema |
| Android pixel | `MediaProjection` | Diálogo persistente + notificación foreground-service obligatoria | Ídem; además la a11y actual ya cubre UI sin píxeles — justificar para qué se necesita MediaProjection |
| macOS (futuro) | `ScreenCaptureKit` | TCC "Screen Recording" (grant persistente del usuario en Ajustes) | **NOT_IMPLEMENTED** — sin toolchain Mac |

## Checklist que la implementación debe cumplir (condición de aprobación)

- [ ] **Ventanas seguras excluidas**: respetar `WDA_EXCLUDEFROMCAPTURE`/equivalentes del OS — nunca capturar ventanas que el sistema marca protegidas (banca, gestores de contraseñas). Verificar que el adapter no las puede recibir siquiera.
- [ ] **Pausa/revocación**: `SOVIR_OBSERVER_DISABLE` y la revocación del `source_id` deben detener la sesión de captura (la infraestructura de pausa ya existe para el polling actual).
- [ ] **Estado visible**: la UI/indicador no puede decir "protegido" con el sensor apagado, ni ocultar que se está capturando.
- [ ] **Permiso interno separado**: cada `source_id` requiere grant vigente; la revocación borra el buffer (`sovir-edge-store` ya implementa `purge_by_source`).
- [ ] **Pipeline cerrado**: frame→señal→descarte en proceso; píxeles nunca en disco, logs ni egress (ya especificado en ADR-0015).
- [ ] Android: **acotar `packageNames`** por consentimiento antes de cualquier envío a Play — hoy observa todos los paquetes (comentario en el XML lo marca como decisión pendiente).
- [ ] Android Play: la declaración de uso de AccessibilityService (funcionalidad núcleo + disclosure) es requisito de tienda, no opcional.

## Riesgos de tienda (sin afirmar aceptación)

- **Android**: alto — accessibility es el permiso más restringido de Play; requiere justificación documental y puede pedir video/demo.
- **Windows**: bajo — Graphics.Capture es el patrón consentido estándar; sin tienda involucrada en sideload dev.
- **Extensión**: bajo — permisos mínimos, host solo loopback; `scripting` amplio pero gated por origins concedidos.
- **iOS**: ninguno hoy; ScreenCaptureKit no existe en iOS — el modelo iOS queda sin captura (by design).

## Veredicto

Proceder con **Windows.Graphics.Capture primero** (única superficie donde la
captura tiene API consentida madura y toolchain disponible). Android
MediaProjection solo tras justificar qué aporta sobre la a11y existente.
macOS queda NOT_IMPLEMENTED. Nada de esto elimina la aprobación humana
requerida por invariante 8 — este paquete es la entrada a esa decisión.
