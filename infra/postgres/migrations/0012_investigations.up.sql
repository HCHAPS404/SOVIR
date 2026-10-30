-- Completed deterministic investigations (B5). A row is a bounded
-- metadata report: counts (facts) and typed sequence hypotheses — never
-- event payloads. Facts and hypotheses are JSONB because they are read
-- whole with the report, never queried relationally.
CREATE TABLE IF NOT EXISTS investigations (
  investigation_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  window_ms BIGINT NOT NULL CHECK (window_ms >= 0),
  events_examined BIGINT NOT NULL CHECK (events_examined >= 0),
  facts JSONB NOT NULL,
  hypotheses JSONB NOT NULL,
  created_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS investigations_principal
  ON investigations(tenant_id, principal_id, created_at_ms DESC);
ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON investigations;
CREATE POLICY tenant_isolation ON investigations
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT ON investigations TO sovir_app;
