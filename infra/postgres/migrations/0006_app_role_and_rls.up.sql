-- B19/infra: dedicated non-owner application role + tenant-bound RLS.
--
-- The migration owner keeps DDL rights and bypasses RLS (no FORCE) so the
-- CI migration job and the global retention sweep keep working. The
-- application should connect as `sovir_app`, which can only see rows of
-- the tenant bound per transaction via
--   SET LOCAL app.tenant_id = '<tenant>';
-- An empty/unset setting denies every row (fail closed).
--
-- The dev password below is intentionally weak and local-only; production
-- credentials come from the secret manager, never from this file.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sovir_app') THEN
    CREATE ROLE sovir_app LOGIN PASSWORD 'sovir_app_dev_only';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO sovir_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sovir_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sovir_app;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'consent_grants', 'observation_events', 'sessions',
    'devices', 'interventions', 'deletion_receipts']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = current_setting(''app.tenant_id'', true))
         WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
