# Replay + Housekeeping Design

## Full schema script

Use `db/init/000_full_schema.sql` for a fresh database. It includes:
- Event success/failure tables + base indexes
- Replay audit tables + indexes + counters
- Housekeeping audit tables + indexes

Legacy seed files remain for test data only.

## Replay design

### API flow
1) UI submits replay request to backend.
   - `POST /api/v1/replay` supports:
     - `ids` (selected IDs)
     - `filters` (selection spec)
2) Backend resolves the failure table for the event key.
3) Backend creates a replay job + items, then calls the event app replay endpoint.
4) Event app replays and returns per‑record status.
5) Backend updates replay items + job summary.
6) UI refreshes success/failure tables and uses audit endpoints.

### Tables

#### `replay_jobs`
One row per replay request.

Key columns:
- `id` — replay job ID (UUID)
- `event_key` — event type (e.g. `payments.in`)
- `day` — day context for the replay
- `selection_type` — `ids` or `filters`
- `filters_json` — serialized filter spec
- `snapshot_at` — timestamp used for filtered replay
- `requested_by` + `reason` — operator info
- `total_requested` — count requested
- `status` — `RUNNING`, `COMPLETED`, `PARTIAL`, `FAILED`
- `succeeded_count`, `failed_count`, `queued_count` — job summary counts
- `created_at`, `completed_at`

Indexes:
- `idx_replay_jobs_created_at`
- `idx_replay_jobs_event_key`
- `idx_replay_jobs_requested_by`

#### `replay_items`
One row per replayed record ID.

Key columns:
- `job_id`, `record_id`, `event_key`
- `status` — `QUEUED`, `REPLAYED`, `FAILED`, `NOT_FOUND`
- `attempt_count`, `last_attempt_at`, `last_error`, `emitted_id`
- Enrichment fields from the failure row:
  `trace_id`, `message_key`, `account_number`, `exception_type`, `event_datetime`, `source_payload`

Indexes:
- `idx_replay_items_job`
- `idx_replay_items_record`
- `idx_replay_items_event`
- `idx_replay_items_job_status`
- `idx_replay_items_job_record`
- `idx_replay_items_job_trace`

### Backend behavior
1) **Create job**: insert into `replay_jobs` with status `RUNNING`.
2) **Insert items**: insert `replay_items` with status `QUEUED` and detail fields.
3) **Call event app**: POST to event replay endpoint with `{ replayId, ids, ... }`.
4) **Update items**: per‑record statuses from event app response.
5) **Update job**: set `succeeded_count/failed_count/queued_count` + `status` + `completed_at`.

### Audit endpoints
- `GET /api/v1/replay-jobs` — job list (paged)
- `GET /api/v1/replay-jobs/{replayId}/items` — items for a job

Both endpoints read from `replay_jobs` and `replay_items` respectively.

## Housekeeping design

Housekeeping runs daily (cron) and supports manual trigger. There are three job types:
- `RETENTION` — delete old event rows (success + failure)
- `REPLAY_AUDIT` — cleanup replay audit data (jobs/items)
- `HOUSEKEEPING_AUDIT` — cleanup housekeeping audit data (runs/items)

### Tables

#### `housekeeping_runs`
One row per execution attempt.

Columns:
- `id`, `job_type`, `event_key`
- `trigger_type` (manual/scheduled)
- `status`, `cutoff_date`, `run_date`, `attempt`
- `started_at`, `completed_at`, `duration_ms`
- `deleted_success`, `deleted_failure`, `deleted_total`
- `error_message`

Indexes:
- `idx_housekeeping_runs_started`
- `idx_housekeeping_runs_date`
- `idx_housekeeping_runs_job_event_date`

#### `housekeeping_run_items`
Per‑run breakdown by event key.

Columns:
- `run_id`, `event_key`
- `deleted_success`, `deleted_failure`, `deleted_total`
- `created_at`

#### `housekeeping_daily`
Daily snapshot + last run summary.

Columns:
- `job_type`, `event_key`, `run_date` (PK)
- `retention_days`, `cutoff_date`, `snapshot_at`
- `eligible_success`, `eligible_failure`, `eligible_total`
- `last_status`, `last_run_id`, `last_attempt`
- `last_started_at`, `last_completed_at`, `last_error`

Indexes:
- `idx_housekeeping_daily_status`
- `idx_housekeeping_daily_job_status`
- `idx_housekeeping_daily_job_event_status`

### Runtime behavior
1) **Snapshot**: compute eligible counts and store in `housekeeping_daily`.
2) **Run**: insert row in `housekeeping_runs`, then delete in batches.
3) **Per‑event totals**: insert `housekeeping_run_items` for each event key.
4) **Finish**: update `housekeeping_runs` + `housekeeping_daily` with status and metrics.
5) **Retry**: if last run failed or eligible > 0, a new attempt is allowed for the same day.

### Key UI data sources
- “Next run preview” → `housekeeping_daily`
- “Last day run” → latest `housekeeping_runs` for run_date
- “Run history” → `housekeeping_runs` (paged)
