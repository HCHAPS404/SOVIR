-- Unified sensitive-action audit trail (hardening). Metadata tombstones —
-- like deletion receipts they persist after erasure so administrative
-- actions remain provable. No payloads, no PII beyond principal_id.
CREATE TABLE IF NOT EXISTS audit_events (
  audit_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_tenant_principal
  ON audit_events(tenant_id, principal_id, at_ms);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_events;
CREATE POLICY tenant_isolation ON audit_events
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT ON audit_events TO sovir_app;
-- Evidence window support (B2): list_recent filters by observed_at_ms.
CREATE INDEX IF NOT EXISTS events_tenant_principal_time
  ON observation_events(tenant_id, principal_id, observed_at_ms);
CREATE INDEX IF NOT EXISTS sessions_expiry
  ON sessions(expires_at_ms) WHERE NOT revoked;
