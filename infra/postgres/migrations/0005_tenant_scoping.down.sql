-- Reverts 0005. Rows whose (principal_id, device_id) collide across
-- tenants must be removed before the device PK narrows back — dev schema,
-- no production data, so we delete the colliding non-'dev' rows first.
DELETE FROM devices WHERE tenant_id <> 'dev';
ALTER TABLE devices DROP CONSTRAINT devices_pkey;
ALTER TABLE devices ADD PRIMARY KEY (principal_id, device_id);

DROP INDEX IF EXISTS grants_tenant_principal;
ALTER TABLE consent_grants DROP COLUMN tenant_id;

DROP INDEX IF EXISTS events_tenant_principal_time;
ALTER TABLE observation_events DROP COLUMN tenant_id;

ALTER TABLE devices DROP COLUMN tenant_id;

DROP INDEX IF EXISTS interventions_tenant_principal;
ALTER TABLE interventions DROP COLUMN tenant_id;

DROP INDEX IF EXISTS receipts_tenant_principal_time;
ALTER TABLE deletion_receipts DROP COLUMN tenant_id;
CREATE INDEX IF NOT EXISTS receipts_principal_time
  ON deletion_receipts(principal_id, purged_at_ms DESC);
