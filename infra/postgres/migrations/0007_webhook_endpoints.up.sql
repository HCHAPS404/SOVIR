-- B20 durable webhook endpoints. The `secret` column is dev-grade plaintext
-- (HMAC signing key); production must store a KMS reference instead, see
-- ADR-0010 egress policy. Tenant-scoped like every principal-owned table.
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  endpoint_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  kinds TEXT[] NOT NULL,
  created_at_ms BIGINT NOT NULL,
  revoked_at_ms BIGINT
);
CREATE INDEX IF NOT EXISTS webhooks_tenant_principal
  ON webhook_endpoints(tenant_id, principal_id);
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON webhook_endpoints;
CREATE POLICY tenant_isolation ON webhook_endpoints
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_endpoints TO sovir_app;
