-- Durable inference budget reservations (B21 spend-settlement). Every
-- remote inference call first writes a `pending` reservation inside the
-- tenant transaction — the atomic cap check lives there, killing the
-- check-then-act race of the old spent+est read. After the verdict the
-- row is `settled` with actual spend + usage accounting, or `refunded`
-- when the gateway fails. `inference_budget.spent_micro_usd` only ever
-- counts settled rows.
CREATE TABLE IF NOT EXISTS inference_reservations (
  reservation_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  -- Idempotency: one reservation per logical request.
  request_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','settled','refunded')),
  est_micro_usd BIGINT NOT NULL CHECK (est_micro_usd >= 0),
  actual_micro_usd BIGINT CHECK (actual_micro_usd IS NULL OR actual_micro_usd >= 0),
  -- Usage accounting, populated at settle time.
  provider TEXT,
  model TEXT,
  tokens_est INTEGER,
  tokens_actual INTEGER,
  cache_hit BOOLEAN,
  redaction_tier TEXT,
  created_at_ms BIGINT NOT NULL,
  settled_at_ms BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS inference_reservations_request
  ON inference_reservations(tenant_id, request_id);
CREATE INDEX IF NOT EXISTS inference_reservations_tenant_state
  ON inference_reservations(tenant_id, state);
ALTER TABLE inference_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inference_reservations;
CREATE POLICY tenant_isolation ON inference_reservations
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE ON inference_reservations TO sovir_app;
