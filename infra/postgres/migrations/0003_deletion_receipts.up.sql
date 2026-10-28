-- B16: durable audit tombstones produced by erasure. Receipts carry counts
-- and a pseudonymous principal id only; they persist after purge so the
-- deletion itself is auditable. RLS stays default-deny like every table.
CREATE TABLE IF NOT EXISTS deletion_receipts (
  receipt_id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  purged_at_ms BIGINT NOT NULL,
  events_deleted BIGINT NOT NULL,
  grants_deleted BIGINT NOT NULL,
  interventions_deleted BIGINT NOT NULL,
  sessions_revoked BIGINT NOT NULL,
  devices_revoked BIGINT NOT NULL,
  labels_scrubbed BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS receipts_principal_time
  ON deletion_receipts(principal_id, purged_at_ms DESC);
ALTER TABLE deletion_receipts ENABLE ROW LEVEL SECURITY;
