# B8 — Propuesta: contrato de identidad, autenticación y sesiones

**Estado:** PROPUESTA para revisión (Claude + maintainer). Nada de esto está implementado. No fija interfaces del dominio.

## Problema

Hoy `services/api` confía en un bearer token único de desarrollo y el `grant_id`/`source_id` se autodeclaran en el JSON del evento. Cualquier cliente con el token puede atribuir eventos a cualquier fuente. La misión exige que ningún evento/consentimiento/recurso pueda atribuirse a un usuario arbitrario vía identificador en el body.

## Modelo propuesto

```rust
// sovir-ports (propuesta — Claude decide nombre/forma final)
pub struct Principal {
    pub principal_id: PrincipalId,   // estable, opaco, del IdP
    pub tenant_id: TenantId,         // implícito para individual; explícito en B19
    pub device_id: DeviceId,         // dispositivo registrado (ver B9)
    pub session_id: SessionId,
    pub scopes: Vec<Scope>,          // ej. consent:write, events:write
}

pub trait IdentityProvider {
    async fn resolve(&self, credential: &Credential) -> Result<Principal, AuthError>;
    async fn revoke_session(&self, session: &SessionId) -> Result<(), AuthError>;
}
```

- `Principal` lo construye **solo** el adaptador de autenticación a partir de credenciales verificadas (OIDC access token / session cookie). Nunca desde campos del body.
- `ConsentGrant` pasa a ligarse a `(principal_id, device_id, source_id, modality)` — el cambio de binding es dominio de Claude; aquí solo se propone el dato.
- Servidor mantiene `SessionStore` (puerto) con revocación, expiración y rotación de refresh.

## Endpoints propuestos (v0 dev)

| Método | Ruta | Notas |
|---|---|---|
| `POST` | `/v1/auth/dev-session` | Solo `SOVIR_ENV=local/test`: emite sesión sintética para un `dev_principal_id` fijo; permite probar flujos sin IdP real. Marcada explícitamente como no-producción. |
| `POST` | `/v1/auth/logout` | Revoca la sesión del principal autenticado. |
| `GET`  | `/v1/auth/whoami` | Devuelve principal/tenant/device/scopes para depuración de contrato. |

El adaptador OIDC real (`Authorization Code + PKCE` para apps nativas, cookie HttpOnly+SameSite para consola web) se conecta tras decisión del maintainer sobre proveedor (clave pendiente de aprobación).

## Rutas editables (ticket Devin)

- `services/api/` middleware de auth, adaptador de sesiones, endpoints `/v1/auth/*`, tests de contrato HTTP.
- `infra/postgres/migrations/0002_sessions.up/down.sql` (cuando exista store durable).
- Propuesta de puerto en `docs/backend/proposals/` — **no** se edita `sovir-ports` sin aprobación de Claude.

## Rutas prohibidas

- `crates/sovir-domain`, `sovir-application` (binding consent→principal es de Claude).
- `apps/` (flujo de login UI es de Cursor).

## Tests de aceptación (obligatorios)

1. Sin credencial → 401 en todos los endpoints protegidos.
2. Evento cuyo `source_id` no pertenece al principal → 403.
3. Token/sesión expirada → 401.
4. Sesión revocada (logout) → 401 inmediato en el siguiente request.
5. Cambiar `dev_principal_id` entre sesiones no hereda concesiones anteriores.
6. IdP caído/no alcanzable → fail closed (503/401, nunca acceso).
7. CSRF: cookie de sesión web exige `SameSite` + origen validado (cuando exista sesión web).

## Dependencias y abiertos

- **B9** aporta `device_id` registrado/attestation; hasta entonces `device_id` puede ser sintético.
- **B16** define retención de sesiones y borrado en logout/erasure.
- Decisión maintainer: proveedor OIDC concreto y si la consola web usará cookie o bearer.
