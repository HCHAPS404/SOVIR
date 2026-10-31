-- Dev sessions, device registry and intervention delivery queue (ADR-0006, B15).
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_device ON sessions(device_id) WHERE NOT revoked;
CREATE TABLE IF NOT EXISTS devices (
  principal_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  registered_at_ms BIGINT NOT NULL,
  last_seen_at_ms BIGINT,
  revoked_at_ms BIGINT,
  PRIMARY KEY (principal_id, device_id)
);
CREATE TABLE IF NOT EXISTS interventions (
  intervention_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at_ms BIGINT NOT NULL,
  next_attempt_at_ms BIGINT NOT NULL,
  last_error TEXT,
  audit JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS interventions_due ON interventions(next_attempt_at_ms)
  WHERE state IN ('pending','failed');
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;
-- Default deny stands until role/policy engineering, same rule as 0001.
