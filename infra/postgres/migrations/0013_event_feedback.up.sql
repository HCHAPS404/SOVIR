-- Human verdict labels on emitted events (B3 eval-loop). Closed
-- taxonomy verdicts only; the label binds event + principal + tenant.
-- FK cascade keeps purge semantics: deleting the principal's events
-- removes their feedback rows in the same transaction.
CREATE TABLE IF NOT EXISTS event_feedback (
  event_id TEXT PRIMARY KEY REFERENCES observation_events(event_id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'false_positive', 'unsure')),
  labeled_at_ms BIGINT NOT NULL CHECK (labeled_at_ms >= 0)
);
CREATE INDEX IF NOT EXISTS event_feedback_principal
  ON event_feedback(tenant_id, principal_id);
ALTER TABLE event_feedback ENABLE ROW LEVEL SECURITY;
