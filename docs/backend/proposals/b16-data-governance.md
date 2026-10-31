# B16 — Propuesta: gobernanza y ciclo de vida de los datos

**Estado:** PROPUESTA + política ejecutable en diseño. Sin implementación todavía. La gobernanza es requisito previo de persistencia real.

## Clasificación de datos (reusa el enum del contrato)

| Clase | Qué es | Almacenamiento | Retención propuesta | Egreso remoto |
|---|---|---|---|---|
| `PUBLIC` | Metadatos sin identificar | local + sync permitido | 90 días | permitido |
| `PERSONAL` | Atribuible a un principal (IDs, digests de fuente) | local + sync cifrada opcional | 30 días | solo con consent + redacción |
| `SENSITIVE` | Contenido de pantalla, mensajes, salud/finanzas | solo local cifrado | 7 días por defecto, configurable a menos | requiere política adicional explícita |
| `SECRET` | Contraseñas, OTP, claves, docs de identidad | **nunca se almacena** | 0 | siempre rechazado en ingesta |

Invariantes ejecutables ya presentes: `SECRET` se rechaza en dominio; fixtures nunca llevan `payload_ref` ni `SECRET` (verificado en CI por `contract_check.py`).

## Piezas a implementar (orden)

1. **Matriz de retención en tabla**: `data_categories(name, class, retention_days, egress_policy)` + job de purga (`DELETE ... WHERE created_at < now() - retention`).
2. **Borrado por sujeto (erasure)**: `DELETE` en cascada por `principal_id`/`tenant_id` en `consent_grants`, `observation_events`, `sessions`, `devices` + verificación post-borrado (`count == 0`). Registro de auditoría conserva solo el hecho del borrado, no el contenido.
3. **Exportación**: `GET /v1/me/export` → JSON con concesiones, eventos (metadatos), dispositivos y sesiones del principal autenticado. Debe excluir datos de otros principals (test obligatorio).
4. **Trazabilidad de consentimiento**: tabla `consent_audit(grant_id, principal_id, action, at, actor)` append-only.
5. **Redacción antes de egreso**: capa que elimina campos `payload_ref`/contenido antes de enviar a proveedores (bloqueo estructural, no regex).
6. **Logs**: assertion en tests — ningún log contiene `content_digest` crudo, tokens ni bodies.

## Rutas editables (ticket Devin)

- `infra/postgres/migrations/0003_governance.*.sql` (retention, consent_audit, índices de purga).
- `services/api/` endpoints `/v1/me/export`, `DELETE /v1/me/data` (requiere B8).
- `services/` job de purga (in-process cron por ahora).

## Rutas prohibidas

- `crates/sovir-domain` (la clasificación vive ahí; aquí solo se persiste/ejecuta).
- RLS policies: coordinar con B19 antes de escribirlas.

## Tests de aceptación

1. Evento `SECRET` → rechazado (ya verde hoy).
2. Evento sin consentimiento vigente → 403.
3. Revocación → eventos posteriores de esa fuente 403 y purga marcada.
4. `DELETE /v1/me/data` → 0 filas accesibles del principal (test de conteo en tabla).
5. Export no contiene `principal_id` ajeno (fixture multi-usuario).
6. Purga respeta retention por clase.
7. Logs del smoke no contienen digests ni tokens.

## Dependencias

- **B8**: erasure/export necesitan principal autenticado.
- **B21-B** (ya en b21): runner de migraciones para 0003.
- Abierto: ¿retenciones exactas por clase las fija el maintainer o van por ADR?
