-- PROPOSED schema for future PostgreSQL adapter. NOT executed by development API.
-- Application must bind every query to an authenticated principal/tenant.
CREATE TABLE IF NOT EXISTS consent_grants (
  tenant_id UUID NOT NULL,
  grant_id UUID NOT NULL,
  principal_id UUID NOT NULL,
  device_id UUID NOT NULL,
  source_id TEXT NOT NULL,
  permitted_modalities TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, grant_id)
);
CREATE TABLE IF NOT EXISTS observation_events (
  tenant_id UUID NOT NULL,
  event_id UUID NOT NULL,
  principal_id UUID NOT NULL,
  grant_id UUID NOT NULL,
  source_id TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  modality TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  data_class TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,event_id),
  FOREIGN KEY (tenant_id,grant_id) REFERENCES consent_grants(tenant_id,grant_id)
);
CREATE INDEX IF NOT EXISTS obs_tenant_principal_time ON observation_events(tenant_id,principal_id,observed_at DESC);
ALTER TABLE consent_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_events ENABLE ROW LEVEL SECURITY;
-- No policies intentionally: default deny for non-owner roles until tenant/session auth
-- and role configuration are engineered. Never grant BYPASSRLS to application role.
-- Partitioning, retention/purge jobs, migration rollback and encryption are open work.
