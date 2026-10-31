-- Development-grade schema aligned with sovir-domain types (TEXT ids, *_ms
-- epoch columns, boolean revoked). The API binds principal/device from the
-- authenticated session, never from self-declared client fields.
CREATE TABLE IF NOT EXISTS consent_grants (
  grant_id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS observation_events (
  event_id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  consent_grant_id TEXT NOT NULL REFERENCES consent_grants(grant_id),
  observed_at_ms BIGINT NOT NULL,
  modality TEXT NOT NULL,
  sensitive_data_class TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  signals TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obs_principal_time ON observation_events(principal_id, observed_at_ms DESC);
ALTER TABLE consent_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE observation_events ENABLE ROW LEVEL SECURITY;
-- No policies intentionally: default deny until tenant/session auth and role
-- configuration are engineered. Never grant BYPASSRLS to the application role.
-- Tenant scoping, retention/purge jobs and encryption remain open work (B16).
