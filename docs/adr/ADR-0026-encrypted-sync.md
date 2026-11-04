# ADR-0026 — Sincronización cifrada de configuración entre dispositivos (H8)

Estado: **borrador — requiere decisión del maintainer** (ver REQUIRES_HUMAN.md)
Fecha: 2026-07-25

## Contexto

Hoy cada dispositivo guarda sus propios ajustes: exclusiones de sitios/apps
(extensión y Android), nivel de protección, pausa maestra. El usuario espera
que editar en la consola web aplique en el móvil y viceversa. Sincronizar eso
por el servidor es un problema de privacidad: la lista de exclusiones
revela qué sitios bancarios o íntimos usa la persona — es PII estructural.

Invariantes en tensión: local-first y minimización vs la conveniencia de
settings compartidos.

## Opciones

| Opción | Qué ve el servidor | Complejidad | Riesgo |
|---|---|---|---|
| **A. Sync en claro** | Todo el payload | Baja | La lista de exclusiones es PII — rechazable |
| **B. Sync cifrada servidor-cega** | Solo blob cifrado + versión | Media | Gestión de claves entre dispositivos |
| **C. No sync; edición por dispositivo** | Nada | Nula | Ya implementado; mala UX multi-dispositivo |

## Decisión propuesta (a aprobar)

**B — sync cifrada servidor-cega**, con alcance limitado a settings de
observación (exclusiones, inclusiones explícitas de sensibles, pausa):

- Blob cifrado por dispositivo con una clave derivada localmente
  (XChaCha20-Poly1305 o AES-256-GCM — elegir una).
- El servidor guarda `{principal_id, key_version, blob, updated_at_ms,
  writer_device_id}` — nada más. Ve metadatos de escritura, no contenido.
- Resolución de conflicto: **last-writer-wins por documento** (settings es un
  solo documento por principal, no por campo) — simple y honesto; documentar
  que dos ediciones simultáneas pisan la más vieja.
- La clave nunca sale del dispositivo; el enrolamiento de un segundo
  dispositivo se hace por el canal ya autenticado (OIDC) — el primer
  dispositivo publica la clave envuelta, o el usuario aprueba en pantalla.

## Lo que NO sincroniza

- Grants de consentimiento (son por fuente+dispositivo a propósito).
- Eventos ni historial — jamás sincronizables.
- Nivel de protección (pendiente del ADR de niveles — se añade luego al
  mismo blob).

## Trabajo una vez aprobado

1. `POST /v1/me/sync/settings` (put blob, versioned; get devuelve el último).
2. Cifrado en cada cliente: WebCrypto en extensión/consola, Tink/Keystore en
   Android — mismas primitivas, mismo formato.
3. Migración: primera versión = estado local actual del dispositivo que
   escribe primero.
4. Tests: servidor no puede leer el blob (literal: no hay código de
   descifrado server-side); dos escrituras → gana la última con
   `updated_at_ms` auditable.

## Riesgos

- Pérdida de clave = pérdida de settings (documentar; aceptable — se
  re-configura).
- Multi-tenant real: la clave es por principal, no por tenant.
