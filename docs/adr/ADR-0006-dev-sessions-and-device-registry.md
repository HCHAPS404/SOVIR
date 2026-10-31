# ADR-0006 — Sesiones dev tipadas, Principal y registro de dispositivos

- Estado: propuesto (pendiente aprobación maintainer)
- Contexto: el API loopback autenticaba con un bearer dev global sin identidad.
  La misión exige principal, sesiones cortas y consent ligado a
  principal+device+source+modality (B8/B9). Claude Code aún no está contratado;
  el maintainer asigna temporalmente la implementación del dominio a Devin
  (docs/backend/proposals/b8-identity-contract.md y b9-devices-adapter.md son la
  base de diseño) y Claude queda como revisor futuro.

## Decisión

1. `sovir-domain` gana `Platform`, `Scope`, `Principal`, `Session` y `Device`
   (tipos puros, sin I/O). `ConsentGrant` y `ObservedEvent` ganan `principal_id`
   y `device_id` con `serde(skip_deserializing)`: el cliente NO puede inyectarlos;
   el servidor los sella desde la sesión autenticada. El JSON Schema/OpenAPI no
   cambian (los campos no forman parte del payload del cliente).
2. `sovir-ports` gana dos puertos síncronos coherentes con los existentes:
   `SessionStore` (issue/resolve/revoke/revoke_by_device) y
   `DeviceRegistry` (register/get/list/revoke/revoke_by_principal).
3. `SovirService`: `issue_dev_session`, `authenticate`, `logout`,
   `register_device`, `list_devices`, `revoke_device`; `grant` e `ingest` ahora
   reciben `&Principal` y sellan el binding. `validate_consent` exige además
   que el binding principal/device del grant coincida con el del evento.
4. `services/api`: `POST /v1/auth/dev-session` (emite sesión dev corta, gated a
   `SOVIR_ENV=local|test`), `POST /v1/auth/logout`, `GET /v1/auth/whoami`,
   `POST/GET /v1/devices`, `POST /v1/devices/{id}/revoke`. Los endpoints de datos
   autentican por token de sesión (Bearer), no por el token dev global.
5. Revocar un dispositivo revoca sus sesiones y sus consentimientos ligados
   (fail closed). Un dispositivo registrado y revocado no puede seguir usando
   una sesión ni emitir eventos.
6. Los tokens de sesión dev se generan con hash de reloj+contador+datos de la
   sesión. NO son criptográficos; está documentado y el servicio sigue siendo
   loopback-only. El proveedor OIDC real queda pendiente de decisión.

## Consecuencias

- Contratos públicos sin cambios (fixtures siguen conformes); la semántica de
  autenticación del API dev sí cambia (Bearer = sesión).
- Persistencia de sesiones/dispositivos en Postgres queda para migración 0002
  junto al adaptador durable.
- Nada de esto es auth de producción: sin OIDC, sin MFA, sin tenant isolation
  real. El runbook y B21_PLATFORM_STATUS lo mantienen como NOT_IMPLEMENTED.

## Alternativas descartadas

- JWT/OIDC ya: requiere decisión de proveedor (Auth0/Clerk/self-hosted) y
  presupuesto; bloquearía el e2e. Postpuesto, no rechazado.
- Binding por campo libre enviado por el cliente: inseguro, descartado por la
  regla "self-declared tenant is not proof".
