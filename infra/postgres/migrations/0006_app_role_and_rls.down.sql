-- Reverts 0006: drops tenant policies and the application role.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'consent_grants', 'observation_events', 'sessions',
    'devices', 'interventions', 'deletion_receipts']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM sovir_app;
REVOKE USAGE ON SCHEMA public FROM sovir_app;
-- Drop the default-privilege grants issued to sovir_app by every role that
-- granted them (the migration runner's role owns them).
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  REVOKE ALL ON TABLES FROM sovir_app;
DROP ROLE IF EXISTS sovir_app;
