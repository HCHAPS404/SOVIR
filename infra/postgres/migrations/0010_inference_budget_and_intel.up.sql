-- B4/B5 seams (ADR-0012): durable per-tenant inference budget and
-- verified threat-intel indicators. Budget rows hold integer micro-USD
-- (1_000_000 = USD 1.00); the cap lives on the row so a future per-plan
-- override (B7) needs no schema change. Indicators carry mandatory
-- provenance — the app layer refuses to record unverified candidates.
CREATE TABLE IF NOT EXISTS inference_budget (
  tenant_id TEXT PRIMARY KEY,
  spent_micro_usd BIGINT NOT NULL DEFAULT 0,
  cap_micro_usd BIGINT NOT NULL
);
ALTER TABLE inference_budget ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inference_budget;
CREATE POLICY tenant_isolation ON inference_budget
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE ON inference_budget TO sovir_app;

CREATE TABLE IF NOT EXISTS intel_indicators (
  indicator_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence_bp INTEGER NOT NULL,
  provenance TEXT NOT NULL,
  at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS intel_tenant ON intel_indicators(tenant_id, at_ms);
ALTER TABLE intel_indicators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON intel_indicators;
CREATE POLICY tenant_isolation ON intel_indicators
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT ON intel_indicators TO sovir_app;
