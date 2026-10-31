-- B10 durable idempotency: first response per (tenant, principal, key) is
-- stored so replays return it and conflicting reuse conflicts. Metadata
-- only — body_hash is a non-reversible request fingerprint.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  idem_key TEXT NOT NULL,
  body_hash BIGINT NOT NULL,
  response_json JSONB NOT NULL,
  created_at_ms BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, principal_id, idem_key)
);
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON idempotency_keys;
CREATE POLICY tenant_isolation ON idempotency_keys
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, DELETE ON idempotency_keys TO sovir_app;
