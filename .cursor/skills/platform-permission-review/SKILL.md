---
name: platform-permission-review
description: Revisa permisos reales de captura y sensores en apps Android, iOS, escritorio y extensión. Úsala al editar apps/android, apps/ios, apps/desktop o apps/extension, o cuando se pidan permisos de pantalla, accesibilidad o host. No cambia el dominio ni los contratos.
---

# Revisión de permisos de plataforma

Rol: Cursor. Claude conserva la revisión de seguridad del núcleo. Esta skill no autoriza permisos nuevos ni firma la revisión humana.

## Alcance

Leer y comentar solo `apps/android`, `apps/ios`, `apps/desktop` y `apps/extension`, más `docs/design/FRONTEND_MASTER_PLAN.md` y ADR-0002. No editar `crates/`, `packages/contracts`, `infra/` ni `.github/`.

## Pasos

1. Leer el ticket y listar cada permiso, entitlement o `host_permission` declarado.
2. Contrastarlo con la API real del sistema: MediaProjection, ScreenCaptureKit, Windows.Graphics.Capture, portal ScreenCast o host de la extensión. Si el toolchain no está instalado, marcar `NOT_IMPLEMENTED`.
3. Separar permiso del sistema, permiso interno de SOVIR y estado visible para la persona. Un diálogo dibujado en la app no sustituye el diálogo del sistema.
4. Comprobar exclusión de ventanas seguras, pausa, revocación y que la UI no diga «protegido» con el sensor apagado.
5. Rechazar accesibilidad, micrófono, SMS o captura de fondo si el ticket no los nombra.

## Salida

Tabla: permiso, superficie, API del sistema, justificación del ticket, riesgo de tienda, evidencia. Sin afirmar que la tienda ya lo aceptó.
