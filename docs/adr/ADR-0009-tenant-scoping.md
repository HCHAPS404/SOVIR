# ADR-0009 — Aislamiento por tenant en puertos y recursos

- Estado: propuesto (pendiente aprobación maintainer)
- Contexto: B19. Las sesiones dev ya llevaban `tenant_id` pero siempre
  `"dev"`, y todos los lookups se hacían solo por `principal_id`/`device_id`.
  Dos tenants con el mismo `principal_id` compartirían grants, eventos,
  dispositivos e intervenciones: fuga real de aislamiento.

## Decisión

1. `tenant_id` queda **sellado por el servidor** en todo recurso
   principal-owned (`ConsentGrant`, `ObservedEvent`, `Device`,
   `Intervention`, `WebhookEndpoint`, `DeletionReceipt`) con
   `skip_deserializing` — el cliente no puede inyectarlo, igual que
   `principal_id`/`device_id` en ADR-0006.
2. Todo puerto con lookup por principal/device recibe `tenant_id` como
   primer argumento y los adaptadores filtran por la tupla completa.
   `InMemoryDeviceRegistry` pasa a clave `(tenant, principal, device)`;
   las mismas tuplas se aplican en SQL (`WHERE tenant_id = $1 AND ...`).
3. `validate_consent` exige `grant.tenant_id == event.tenant_id`: un grant
   sellado en un tenant nunca autoriza un evento sellado en otro.
4. `issue_dev_session` acepta `tenant_id` declarado (default `"dev"`).
   Auto-declarado **no es prueba de autorización** (ADR-0006); existe para
   ejercitar el aislamiento de punta a punta hasta que OIDC real asigne
   tenants verificados.
5. Migración `0005`: columnas `tenant_id NOT NULL`, índice por
   `(tenant_id, principal_id)` donde hace falta, y la PK de `devices`
   pasa a `(tenant_id, principal_id, device_id)`.
6. Los sweeps globales de retención (`*_any`) permanecen cross-tenant por
   diseño: los ejecuta el job programado, no un principal autenticado.

## Consecuencias

- Un `principal_id` repetido entre tenants ya no puede leer ni revocar
  recursos del otro tenant (test `tenant_isolation_blocks_cross_tenant_access`).
- RLS en Postgres sigue default-deny; la política `tenant_id = current_setting`
  llega con la migración 0004 (rol no-owner).
- Cuando OIDC aterrice, el tenant pasará a venir del token verificado y el
  parámetro `tenant_id` de dev-session se elimina.
