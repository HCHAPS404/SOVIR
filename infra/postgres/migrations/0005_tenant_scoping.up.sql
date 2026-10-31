-- B19: tenant scoping. Every principal-owned row carries the sealed
-- tenant_id from the authenticated session; lookups scope by
-- (tenant_id, principal_id[, device_id]). Dev migrations have never run
-- against production data, so backfilling is not needed — existing dev
-- rows get 'dev'.
ALTER TABLE consent_grants ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'dev';
ALTER TABLE consent_grants ALTER COLUMN tenant_id DROP DEFAULT;
CREATE INDEX IF NOT EXISTS grants_tenant_principal
  ON consent_grants(tenant_id, principal_id);

ALTER TABLE observation_events ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'dev';
ALTER TABLE observation_events ALTER COLUMN tenant_id DROP DEFAULT;
CREATE INDEX IF NOT EXISTS events_tenant_principal_time
  ON observation_events(tenant_id, principal_id, observed_at_ms);

ALTER TABLE devices ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'dev';
ALTER TABLE devices ALTER COLUMN tenant_id DROP DEFAULT;
-- Same principal_id+device_id may exist in different tenants: the primary
-- key becomes the full tenant-scoped tuple.
ALTER TABLE devices DROP CONSTRAINT devices_pkey;
ALTER TABLE devices ADD PRIMARY KEY (tenant_id, principal_id, device_id);

ALTER TABLE interventions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'dev';
ALTER TABLE interventions ALTER COLUMN tenant_id DROP DEFAULT;
CREATE INDEX IF NOT EXISTS interventions_tenant_principal
  ON interventions(tenant_id, principal_id);

ALTER TABLE deletion_receipts ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'dev';
ALTER TABLE deletion_receipts ALTER COLUMN tenant_id DROP DEFAULT;
DROP INDEX IF EXISTS receipts_principal_time;
CREATE INDEX IF NOT EXISTS receipts_tenant_principal_time
  ON deletion_receipts(tenant_id, principal_id, purged_at_ms DESC);
