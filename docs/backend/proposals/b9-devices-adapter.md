# B9 — Propuesta: adaptador de registro y revocación de dispositivos

**Estado:** PROPUESTA (Devin implementa endpoints + persistencia; Claude posee el dominio de dispositivos/confianza). Nada implementado.

## Alcance Devin

Persistencia, endpoints HTTP, validación de propiedad y revocación. **No** el modelo de confianza ni attestation nativo (Claude/Cursor).

## Modelo de datos propuesto (migración 0003/0004)

```sql
CREATE TABLE devices (
  tenant_id UUID NOT NULL,
  device_id UUID NOT NULL,
  principal_id UUID NOT NULL,          -- propietario registrado (de B8)
  platform TEXT NOT NULL,              -- android|ios|windows|macos|linux|extension
  label TEXT,
  attestation_digest TEXT,             -- futuro: Play Integrity / DeviceCheck / TP M (nunca secreto)
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, device_id)
);
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
```

## Endpoints propuestos

| Método | Ruta | Notas |
|---|---|---|
| `POST` | `/v1/devices` | Registra dispositivo del principal autenticado. Idempotente por `device_id`. |
| `GET`  | `/v1/devices` | Lista solo dispositivos del principal (authZ por recurso). |
| `POST` | `/v1/devices/{id}/revoke` | Revocación: invalida grants vinculados a `device_id` (propagación coordinada con dominio). |
| `GET`  | `/v1/devices/{id}` | 404 para dispositivos ajenos (no oráculo de existencia). |

## Reglas

- Un evento/concesión solo es válido si `(principal, device, source)` están ligados y el dispositivo no está revocado — la regla de decisión la implementa Claude; el adaptador expone `GET /v1/devices/{id}/status` para el check.
- Revocación es una transición permanente (no un-delete); `revoked_at` es la única mutación permitida además de `last_seen_at`.

## Tests de aceptación

1. Principal A no ve/lista/revoca dispositivos de B (403/404).
2. Revocado → siguiente evento de ese dispositivo = 403 y grants ligados cortados.
3. Re-registro con mismo `device_id` = idempotente (200, sin duplicar).
4. Revocación dos veces = 204 la segunda (idempotente).
5. `platform` fuera del enum → 400.

## Dependencias

- **B8** (principal autenticado) — bloquea implementación; el doc define el contrato ya.
- **Cursor** provee attestation real cuando exista el sensor; `attestation_digest` queda `NULL` hasta entonces.
- **B16**: borrado de principal borra sus devices (cascada).
