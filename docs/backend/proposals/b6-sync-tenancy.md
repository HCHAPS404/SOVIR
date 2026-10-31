# B6 — Sincronización, backups cifrados y tenancy real (propuesta)

Estado: **BLOQUEADO — decisión del maintainer**. Lo implementable sin
decisiones externas ya está hecho (B19: `tenant_id` sellado, scoping en
puertos, RLS por tenant en 0006). Esto es el resto, para revisión humana.

## Alcance propuesto

1. **Identidad real (pre-requisito de todo lo demás)**
   - OIDC con un proveedor real (ADR propio): el `tenant_id` deja de ser
     declarado y pasa a derivarse del token verificado (claim `tid`/`org`).
   - `dev-session` se elimina fuera de `local|test`.
   - Mapping `principal_id` → subject opaco del IdP; nunca email en claro.

2. **Tenancy real**
   - La API conecta como `sovir_app` (no owner) y hace
     `SET LOCAL app.tenant_id` por request/tx → RLS efectivo, no solo
     scoping en queries.
   - Middleware que fija el tenant desde el token antes de tocar el pool.
   - Migración de soporte: tabla `tenants` (id, estado, límites) si se
     requieren cuotas por tenant.

3. **Sincronización / backups**
   - Réplica local-first → dispositivos del mismo principal:
     log de operaciones firmado, resolución last-write-wins por
     `lamport_clock`, payload cifrado extremo a extremo (XChaCha20-Poly1305
     + X25519 por dispositivo). El servidor solo ve ciphertext.
   - Backup cifrado del store con la misma clave de dispositivo; el
     servidor nunca tiene la clave — recuperación = posesión de otro
     dispositivo autorizado.

4. **Enterprise integrations**
   - API keys por tenant (`svk_test_`/`svk_live_`, hasheadas, con scopes
     y rotación) para webhooks administrativos.

## Decisiones que necesita el maintainer

- Proveedor OIDC (y si self-hosted o SaaS).
- Modelo de tenancy: single-tenant por despliegue vs multi-tenant real.
- ¿Backups del lado servidor (cifrados cliente) o solo export local?
- Presupuesto: sync server, almacenamiento de blobs cifrados.

## Lo que NO se hará sin esas decisiones

Ningún código de sync/OIDC/backup se escribe antes de la aprobación — el
scaffold dev actual cumple consent y local-first sin ellos.
