-- Full schema for event monitoring + replay audit + housekeeping.
-- This script is for fresh databases.

CREATE TABLE IF NOT EXISTS payments_in_success (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_datetime DATETIME NOT NULL,
  event_trace_id VARCHAR(64),
  account_number VARCHAR(64),
  customer_type VARCHAR(32),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_topic VARCHAR(255),
  source_partition_id INT,
  source_offset BIGINT,
  message_key VARCHAR(255),
  source_payload LONGTEXT,
  transformed_payload LONGTEXT,
  latency_ms BIGINT NOT NULL DEFAULT 0,
  latency_event_received_ms BIGINT NOT NULL DEFAULT 0,
  latency_event_sent_ms BIGINT NOT NULL DEFAULT 0,
  target_topic VARCHAR(255),
  target_partition_id INT,
  target_offset BIGINT
);

CREATE TABLE IF NOT EXISTS payments_in_failure (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_datetime DATETIME NOT NULL,
  event_trace_id VARCHAR(64),
  account_number VARCHAR(64),
  customer_type VARCHAR(32),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_topic VARCHAR(255),
  source_partition_id INT,
  source_offset BIGINT,
  message_key VARCHAR(255),
  source_payload LONGTEXT,
  transformed_payload LONGTEXT,
  latency_ms BIGINT NOT NULL DEFAULT 0,
  latency_event_received_ms BIGINT NOT NULL DEFAULT 0,
  target_topic VARCHAR(255),
  target_partition_id INT,
  target_offset BIGINT,
  exception_type VARCHAR(255),
  exception_message TEXT,
  exception_stack LONGTEXT,
  retriable TINYINT,
  retry_attempt INT
);

CREATE TABLE IF NOT EXISTS loans_in_success (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_datetime DATETIME NOT NULL,
  event_trace_id VARCHAR(64),
  account_number VARCHAR(64),
  customer_type VARCHAR(32),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_topic VARCHAR(255),
  source_partition_id INT,
  source_offset BIGINT,
  message_key VARCHAR(255),
  source_payload LONGTEXT,
  transformed_payload LONGTEXT,
  latency_ms BIGINT NOT NULL DEFAULT 0,
  latency_event_received_ms BIGINT NOT NULL DEFAULT 0,
  latency_event_sent_ms BIGINT NOT NULL DEFAULT 0,
  target_topic VARCHAR(255),
  target_partition_id INT,
  target_offset BIGINT
);

CREATE TABLE IF NOT EXISTS loans_in_failure (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_datetime DATETIME NOT NULL,
  event_trace_id VARCHAR(64),
  account_number VARCHAR(64),
  customer_type VARCHAR(32),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_topic VARCHAR(255),
  source_partition_id INT,
  source_offset BIGINT,
  message_key VARCHAR(255),
  source_payload LONGTEXT,
  transformed_payload LONGTEXT,
  latency_ms BIGINT NOT NULL DEFAULT 0,
  latency_event_received_ms BIGINT NOT NULL DEFAULT 0,
  target_topic VARCHAR(255),
  target_partition_id INT,
  target_offset BIGINT,
  exception_type VARCHAR(255),
  exception_message TEXT,
  exception_stack LONGTEXT,
  retriable TINYINT,
  retry_attempt INT
);

CREATE INDEX IF NOT EXISTS idx_payments_success_event_datetime
  ON payments_in_success (event_datetime, event_trace_id);
CREATE INDEX IF NOT EXISTS idx_payments_failure_event_datetime
  ON payments_in_failure (event_datetime, event_trace_id);

CREATE INDEX IF NOT EXISTS idx_loans_success_event_datetime
  ON loans_in_success (event_datetime, event_trace_id);
CREATE INDEX IF NOT EXISTS idx_loans_failure_event_datetime
  ON loans_in_failure (event_datetime, event_trace_id);

CREATE TABLE IF NOT EXISTS cards_in_success LIKE payments_in_success;
CREATE TABLE IF NOT EXISTS cards_in_failure LIKE payments_in_failure;

CREATE TABLE IF NOT EXISTS accounts_in_success LIKE payments_in_success;
CREATE TABLE IF NOT EXISTS accounts_in_failure LIKE payments_in_failure;

CREATE TABLE IF NOT EXISTS transfers_in_success LIKE payments_in_success;
CREATE TABLE IF NOT EXISTS transfers_in_failure LIKE payments_in_failure;

CREATE TABLE IF NOT EXISTS alerts_in_success LIKE payments_in_success;
CREATE TABLE IF NOT EXISTS alerts_in_failure LIKE payments_in_failure;

CREATE TABLE IF NOT EXISTS kyc_in_success LIKE payments_in_success;
CREATE TABLE IF NOT EXISTS kyc_in_failure LIKE payments_in_failure;

CREATE TABLE IF NOT EXISTS fraud_in_success LIKE payments_in_success;
CREATE TABLE IF NOT EXISTS fraud_in_failure LIKE payments_in_failure;

CREATE TABLE IF NOT EXISTS statements_in_success LIKE payments_in_success;
CREATE TABLE IF NOT EXISTS statements_in_failure LIKE payments_in_failure;

CREATE TABLE IF NOT EXISTS limits_in_success LIKE payments_in_success;
CREATE TABLE IF NOT EXISTS limits_in_failure LIKE payments_in_failure;

CREATE TABLE IF NOT EXISTS replay_jobs (
  id VARCHAR(64) PRIMARY KEY,
  event_key VARCHAR(64) NOT NULL,
  day DATE NOT NULL,
  selection_type VARCHAR(32) NOT NULL,
  filters_json LONGTEXT,
  snapshot_at DATETIME NOT NULL,
  requested_by VARCHAR(128),
  reason VARCHAR(255),
  total_requested INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL,
  succeeded_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  queued_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS replay_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL,
  record_id BIGINT NOT NULL,
  event_key VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  last_attempt_at DATETIME NULL,
  last_error TEXT NULL,
  emitted_id VARCHAR(128) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  trace_id VARCHAR(64) NULL,
  message_key VARCHAR(255) NULL,
  account_number VARCHAR(64) NULL,
  exception_type VARCHAR(255) NULL,
  event_datetime DATETIME NULL,
  source_payload LONGTEXT NULL,
  KEY idx_replay_items_job (job_id),
  KEY idx_replay_items_record (record_id),
  KEY idx_replay_items_event (event_key)
);

CREATE INDEX IF NOT EXISTS idx_replay_jobs_created_at ON replay_jobs (created_at);
CREATE INDEX IF NOT EXISTS idx_replay_jobs_event_key ON replay_jobs (event_key);
CREATE INDEX IF NOT EXISTS idx_replay_jobs_requested_by ON replay_jobs (requested_by);
CREATE INDEX IF NOT EXISTS idx_replay_items_job_status ON replay_items (job_id, status);
CREATE INDEX IF NOT EXISTS idx_replay_items_job_record ON replay_items (job_id, record_id);
CREATE INDEX IF NOT EXISTS idx_replay_items_job_trace ON replay_items (job_id, trace_id);

CREATE TABLE IF NOT EXISTS housekeeping_runs (
  id VARCHAR(64) PRIMARY KEY,
  job_type VARCHAR(32) NOT NULL,
  event_key VARCHAR(64) NOT NULL DEFAULT 'ALL',
  trigger_type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  cutoff_date DATE NOT NULL,
  run_date DATE NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  started_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  duration_ms BIGINT NULL,
  deleted_success BIGINT NOT NULL DEFAULT 0,
  deleted_failure BIGINT NOT NULL DEFAULT 0,
  deleted_total BIGINT NOT NULL DEFAULT 0,
  error_message TEXT NULL
);

CREATE TABLE IF NOT EXISTS housekeeping_run_items (
  run_id VARCHAR(36) NOT NULL,
  event_key VARCHAR(64) NOT NULL,
  deleted_success BIGINT NOT NULL,
  deleted_failure BIGINT NOT NULL,
  deleted_total BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (run_id, event_key),
  INDEX idx_housekeeping_run_items_event (event_key),
  CONSTRAINT fk_housekeeping_run_items_run
    FOREIGN KEY (run_id) REFERENCES housekeeping_runs(id)
);

CREATE TABLE IF NOT EXISTS housekeeping_daily (
  job_type VARCHAR(32) NOT NULL DEFAULT 'RETENTION',
  event_key VARCHAR(64) NOT NULL DEFAULT 'ALL',
  run_date DATE NOT NULL,
  retention_days INT NOT NULL,
  cutoff_date DATE NOT NULL,
  snapshot_at DATETIME NOT NULL,
  eligible_success BIGINT NOT NULL,
  eligible_failure BIGINT NOT NULL,
  eligible_total BIGINT NOT NULL,
  last_status VARCHAR(32) NOT NULL,
  last_run_id VARCHAR(64) NULL,
  last_attempt INT NOT NULL,
  last_started_at DATETIME NULL,
  last_completed_at DATETIME NULL,
  last_error TEXT NULL,
  PRIMARY KEY (job_type, event_key, run_date)
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_runs_started
  ON housekeeping_runs (started_at);
CREATE INDEX IF NOT EXISTS idx_housekeeping_runs_date
  ON housekeeping_runs (run_date, attempt);
CREATE INDEX IF NOT EXISTS idx_housekeeping_runs_job_event_date
  ON housekeeping_runs (job_type, event_key, run_date, attempt);

CREATE INDEX IF NOT EXISTS idx_housekeeping_daily_status
  ON housekeeping_daily (last_status, run_date);
CREATE INDEX IF NOT EXISTS idx_housekeeping_daily_job_status
  ON housekeeping_daily (job_type, last_status, run_date);
CREATE INDEX IF NOT EXISTS idx_housekeeping_daily_job_event_status
  ON housekeeping_daily (job_type, event_key, last_status, run_date);
