CREATE INDEX IF NOT EXISTS idx_accounts_in_success_event_datetime
  ON accounts_in_success (event_datetime);
