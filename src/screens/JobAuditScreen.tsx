import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, postJson } from "../api/client";
import { KpiCard } from "../components/KpiCard";
import { formatDateTime, formatLatency, formatNumber, formatTimeAgo, toDisplayValue } from "../utils/format";
import { isAbortError } from "../utils/errors";
import type { EventCatalogItem } from "../types";

type HousekeepingRun = {
  id: string;
  jobType: string;
  eventKey: string;
  triggerType: string;
  runDate: string;
  attempt: number;
  status: string;
  cutoffDate: string;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  deletedSuccess: number;
  deletedFailure: number;
  deletedTotal: number;
  errorMessage?: string | null;
  eventCount?: number;
  eventKeys?: string | null;
  items?: HousekeepingRunItem[];
};

type HousekeepingRunSummary = {
  jobType: string;
  runDate: string;
  eventKey: string;
  attempts: number;
  deletedSuccess: number;
  deletedFailure: number;
  deletedTotal: number;
  latestAttempt: number;
  latestStatus: string;
  latestTriggerType: string;
  latestCompletedAt?: string | null;
  latestDurationMs?: number | null;
  latestErrorMessage?: string | null;
};

type HousekeepingDaily = {
  jobType: string;
  eventKey: string;
  runDate: string;
  retentionDays: number;
  cutoffDate: string;
  snapshotAt: string;
  eligibleSuccess: number;
  eligibleFailure: number;
  eligibleTotal: number;
  lastStatus: string;
  lastRunId?: string | null;
  lastAttempt: number;
  lastStartedAt?: string | null;
  lastCompletedAt?: string | null;
  lastError?: string | null;
};

type HousekeepingPreviewEvent = {
  eventKey: string;
  deletedSuccess: number;
  deletedFailure: number;
  deletedTotal: number;
  nextRunAt?: string | null;
};

type HousekeepingPreview = {
  cutoffDate: string;
  retentionDays: number;
  snapshotAt: string;
  deletedSuccess: number;
  deletedFailure: number;
  deletedTotal: number;
  nextRunAt?: string | null;
  events: HousekeepingPreviewEvent[];
};

type HousekeepingRunItem = {
  eventKey: string;
  deletedSuccess: number;
  deletedFailure: number;
  deletedTotal: number;
};

type HousekeepingStatus = {
  id: string;
  jobType: string;
  eventKey: string;
  triggerType: string;
  runDate: string;
  attempt: number;
  status: string;
  cutoffDate: string;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  deletedSuccess: number;
  deletedFailure: number;
  deletedTotal: number;
  errorMessage?: string | null;
  items: HousekeepingRunItem[];
};

type JobAuditScreenProps = {
  eventCatalog: EventCatalogItem[];
};

export function JobAuditScreen({ eventCatalog }: JobAuditScreenProps) {
  const [dailyRows, setDailyRows] = useState<HousekeepingDaily[]>([]);
  const [runSummaries, setRunSummaries] = useState<HousekeepingRunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsByDate, setRunsByDate] = useState<Record<string, HousekeepingRun[]>>({});
  const [runsByDateLoading, setRunsByDateLoading] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<HousekeepingPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [status, setStatus] = useState<HousekeepingStatus | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [jobType, setJobType] = useState("RETENTION");
  const [selectedEventKey, setSelectedEventKey] = useState("");
  const [scopeSelection, setScopeSelection] = useState("");
  const [previewPage, setPreviewPage] = useState(0);
  const previewPageSize = 5;
  const [historyPage, setHistoryPage] = useState(0);
  const [historyHasNext, setHistoryHasNext] = useState(false);
  const historyPageSize = 12;

  const pickNextRunAt = useCallback((candidates: Array<string | null | undefined>) => {
    let next: Date | null = null;
    let nextRaw: string | null = null;
    for (const value of candidates) {
      if (!value) {
        continue;
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        continue;
      }
      if (!next || parsed < next) {
        next = parsed;
        nextRaw = value;
      }
    }
    return nextRaw;
  }, []);

  const loadDaily = useCallback((signal?: AbortSignal) => {
    setError(null);
    if (!scopeSelection) {
      return;
    }
    fetchJson<HousekeepingDaily[]>(
      `/api/v1/housekeeping/daily?limit=14&jobType=${encodeURIComponent(jobType)}${
        selectedEventKey ? `&eventKey=${encodeURIComponent(selectedEventKey)}` : ""
      }`,
      signal
    )
      .then((data) => {
        const rows = data ?? [];
        setDailyRows(rows);
        if (rows.length > 0) {
          if (!selectedDate || !rows.some((row) => row.runDate === selectedDate)) {
            setSelectedDate(rows[0].runDate);
          }
        }
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
  }, [jobType, selectedDate, selectedEventKey, scopeSelection]);

  const loadRunHistory = useCallback((signal?: AbortSignal) => {
    setRunsLoading(true);
    const limit = historyPageSize + 1;
    const offset = historyPage * historyPageSize;
    fetchJson<HousekeepingRunSummary[]>(
      `/api/v1/housekeeping/runs/summary?limit=${limit}&offset=${offset}&jobType=${encodeURIComponent(jobType)}${
        jobType === "RETENTION" && selectedEventKey && selectedEventKey !== "ALL"
          ? `&eventKey=${encodeURIComponent(selectedEventKey)}`
          : ""
      }`,
      signal
    )
      .then((data) => {
        const rows = data ?? [];
        setHistoryHasNext(rows.length > historyPageSize);
        setRunSummaries(rows.slice(0, historyPageSize));
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!signal?.aborted) {
          setRunsLoading(false);
        }
      });
  }, [historyPage, historyPageSize, jobType, selectedEventKey]);

  const loadPreview = useCallback((signal?: AbortSignal) => {
    setPreviewLoading(true);
    if (!scopeSelection) {
      setPreviewLoading(false);
      return;
    }
    const fetchPreview = (targetJobType: string, eventKey?: string) =>
      fetchJson<HousekeepingPreview>(
        `/api/v1/housekeeping/preview?jobType=${encodeURIComponent(targetJobType)}${
          eventKey ? `&eventKey=${encodeURIComponent(eventKey)}` : ""
        }`,
        signal
      );
    if (scopeSelection === "ALL_JOBS") {
      Promise.all([
        fetchPreview("RETENTION"),
        fetchPreview("REPLAY_AUDIT"),
        fetchPreview("HOUSEKEEPING_AUDIT"),
      ])
        .then(([retention, replay, housekeeping]) => {
          const combinedEvents = [
            ...(retention?.events ?? []),
            ...(replay?.events ?? []),
            ...(housekeeping?.events ?? []),
          ];
          const deletedSuccess =
            (retention?.deletedSuccess ?? 0) +
            (replay?.deletedSuccess ?? 0) +
            (housekeeping?.deletedSuccess ?? 0);
          const deletedFailure =
            (retention?.deletedFailure ?? 0) +
            (replay?.deletedFailure ?? 0) +
            (housekeeping?.deletedFailure ?? 0);
          const deletedTotal =
            (retention?.deletedTotal ?? 0) +
            (replay?.deletedTotal ?? 0) +
            (housekeeping?.deletedTotal ?? 0);
          setPreview({
            cutoffDate: retention?.cutoffDate ?? replay?.cutoffDate ?? housekeeping?.cutoffDate ?? "",
            retentionDays:
              retention?.retentionDays ??
              replay?.retentionDays ??
              housekeeping?.retentionDays ??
              0,
            snapshotAt: retention?.snapshotAt ?? replay?.snapshotAt ?? housekeeping?.snapshotAt ?? "",
            deletedSuccess,
            deletedFailure,
            deletedTotal,
            nextRunAt: pickNextRunAt([
              retention?.nextRunAt,
              replay?.nextRunAt,
              housekeeping?.nextRunAt,
            ]),
            events: combinedEvents,
          });
        })
        .catch((err) => {
          if (!isAbortError(err)) {
            setError(err instanceof Error ? err.message : String(err));
          }
        })
        .finally(() => {
          if (!signal?.aborted) {
            setPreviewLoading(false);
          }
        });
      return;
    }
    fetchPreview(jobType, selectedEventKey || undefined)
      .then((data) => setPreview(data ?? null))
      .catch((err) => {
        if (!isAbortError(err)) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!signal?.aborted) {
          setPreviewLoading(false);
        }
      });
  }, [jobType, selectedEventKey, scopeSelection]);

  const loadStatus = useCallback((date?: string, signal?: AbortSignal) => {
    if (!scopeSelection) {
      setStatus(null);
      return;
    }
    const query = date ? `?date=${date}` : "";
    const joiner = query ? "&" : "?";
    fetchJson<HousekeepingStatus>(
      `/api/v1/housekeeping/status${query}${joiner}jobType=${encodeURIComponent(jobType)}${
        selectedEventKey ? `&eventKey=${encodeURIComponent(selectedEventKey)}` : ""
      }`,
      signal
    )
      .then((data) => setStatus(data ?? null))
      .catch((err) => {
        if (!isAbortError(err)) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
  }, [jobType, selectedEventKey, scopeSelection]);

  const loadRunsForDate = useCallback((date: string, eventKey: string, signal?: AbortSignal) => {
    if (!date || !eventKey) {
      return;
    }
    const key = `${date}::${eventKey}`;
    setRunsByDateLoading((prev) => ({ ...prev, [key]: true }));
    fetchJson<HousekeepingRun[]>(
      `/api/v1/housekeeping/daily/${date}/runs?jobType=${encodeURIComponent(
        jobType
      )}&eventKey=${encodeURIComponent(eventKey)}`,
      signal
    )
      .then((data) => {
        setRunsByDate((prev) => ({ ...prev, [key]: data ?? [] }));
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!signal?.aborted) {
          setRunsByDateLoading((prev) => ({ ...prev, [key]: false }));
        }
      });
  }, [jobType]);

  useEffect(() => {
    const controller = new AbortController();
    loadDaily(controller.signal);
    loadPreview(controller.signal);
    loadRunHistory(controller.signal);
    return () => controller.abort();
  }, [loadDaily, loadPreview, loadRunHistory]);

  useEffect(() => {
    if (!scopeSelection) {
      return;
    }
    if (scopeSelection === "ALL_JOBS") {
      setJobType("RETENTION");
      setSelectedEventKey("ALL");
      return;
    }
    if (scopeSelection === "REPLAY_AUDIT") {
      setJobType("REPLAY_AUDIT");
      setSelectedEventKey("");
      return;
    }
    if (scopeSelection === "HOUSEKEEPING_AUDIT") {
      setJobType("HOUSEKEEPING_AUDIT");
      setSelectedEventKey("");
      return;
    }
    if (scopeSelection.startsWith("event:")) {
      setJobType("RETENTION");
      setSelectedEventKey(scopeSelection.slice("event:".length));
    }
  }, [scopeSelection]);

  useEffect(() => {
    setPreviewPage(0);
  }, [scopeSelection, jobType]);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }
    const controller = new AbortController();
    loadStatus(selectedDate, controller.signal);
    return () => controller.abort();
  }, [loadStatus, selectedDate]);

  useEffect(() => {
    setSelectedDate(null);
    setRunsByDate({});
    setRunsByDateLoading({});
    setExpandedRows({});
    setHistoryPage(0);
    setRunSummaries([]);
    if (jobType !== "RETENTION") {
      setSelectedEventKey("");
    }
  }, [jobType]);

  useEffect(() => {
    if (eventCatalog.length === 0) {
      setScopeSelection("");
      return;
    }
    if (!scopeSelection) {
      setScopeSelection("ALL_JOBS");
      return;
    }
    if (
      scopeSelection.startsWith("event:") &&
      !eventCatalog.some((event) => `event:${event.eventKey}` === scopeSelection)
    ) {
      setScopeSelection("ALL_JOBS");
    }
  }, [eventCatalog, scopeSelection]);

  const handleRunNow = async () => {
    const isAllEventsSelection =
      jobType === "RETENTION" && (!selectedEventKey || selectedEventKey === "ALL");
    if (isAllEventsSelection) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const eventKeyQuery =
        jobType === "RETENTION" && selectedEventKey && selectedEventKey !== "ALL"
          ? `&eventKey=${encodeURIComponent(selectedEventKey)}`
          : "";
      await postJson<HousekeepingRun>(
        `/api/v1/housekeeping/run?jobType=${encodeURIComponent(jobType)}${eventKeyQuery}`,
        {}
      );
      loadDaily();
      loadPreview();
      loadStatus(selectedDate ?? undefined);
      if (selectedDate && selectedEventKey && selectedEventKey !== "ALL") {
        loadRunsForDate(selectedDate, selectedEventKey);
      }
      loadRunHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const eventLabelMap = useMemo(
    () => new Map(eventCatalog.map((event) => [event.eventKey, event.name])),
    [eventCatalog]
  );
  const systemEventLabels = useMemo(
    () =>
      new Map<string, string>([
        ["replay_jobs", "Replay Jobs"],
        ["replay_items", "Replay Items"],
        ["housekeeping_runs", "Housekeeping Runs"],
        ["housekeeping_run_items", "Housekeeping Run Items"],
        ["housekeeping_daily", "Housekeeping Daily"],
      ]),
    []
  );
  const getEventLabel = useCallback(
    (eventKey: string) =>
      systemEventLabels.get(eventKey) ?? eventLabelMap.get(eventKey) ?? eventKey,
    [eventLabelMap, systemEventLabels]
  );
  const toggleRow = useCallback(
    (runDate: string, eventKey: string) => {
      const rowKey = `${runDate}::${eventKey}`;
      setExpandedRows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
      setSelectedDate(runDate);
      if (!runsByDate[rowKey]) {
        loadRunsForDate(runDate, eventKey);
      }
    },
    [loadRunsForDate, runsByDate]
  );
  const previewEvents = preview?.events ?? [];
  const previewTotals = preview ?? null;
  const latestDaily = dailyRows[0];
  const isAllJobs = scopeSelection === "ALL_JOBS";
  const isAllEvents = jobType === "RETENTION" && (!selectedEventKey || selectedEventKey === "ALL");
  const previewScope =
    isAllJobs
      ? "All jobs"
      : jobType === "RETENTION"
      ? isAllEvents
        ? "All events"
        : getEventLabel(selectedEventKey)
      : jobType === "REPLAY_AUDIT"
      ? "Replay audit tables"
      : "Job audit tables";
  const previewLabel =
    isAllJobs ? "Job" : jobType === "RETENTION" ? "Event" : "Scope";
  const previewPageCount = Math.max(1, Math.ceil(previewEvents.length / previewPageSize));
  const previewHasNext = previewPage + 1 < previewPageCount;
  const previewHasPrev = previewPage > 0;
  const previewStart = previewPage * previewPageSize;
  const previewSlice = previewEvents.slice(previewStart, previewStart + previewPageSize);

  useEffect(() => {
    if (previewPage >= previewPageCount) {
      setPreviewPage(0);
    }
  }, [previewPage, previewPageCount]);
  const selectedDaily =
    (selectedDate && dailyRows.find((row) => row.runDate === selectedDate)) || latestDaily;
  const activeStatus =
    status && selectedDate && status.runDate === selectedDate ? status : null;
  const latestRunForDay = activeStatus;
  const statusSource = activeStatus;
  const statusTone =
    statusSource?.status === "COMPLETED"
      ? "success"
      : statusSource?.status === "FAILED"
      ? "danger"
      : statusSource?.status === "RUNNING"
      ? "warning"
      : "neutral";
  const failedHistory = useMemo(
    () => dailyRows.slice(1).filter((row) => row.lastStatus === "FAILED"),
    [dailyRows]
  );
  const latestFailed = latestDaily?.lastStatus === "FAILED";
  const pendingAfterRun =
    latestDaily &&
    latestDaily.lastStatus === "COMPLETED" &&
    (previewTotals?.deletedTotal ?? latestDaily.eligibleTotal) > 0;
  const pendingLabel = isAllJobs
    ? "entries"
    : jobType === "RETENTION"
    ? "records"
    : jobType === "REPLAY_AUDIT"
    ? "audit entries"
    : "job records";
  const totalDeleted = latestRunForDay?.deletedTotal;
  const totalFailureDeleted = latestRunForDay?.deletedFailure;
  const totalSuccessDeleted = latestRunForDay?.deletedSuccess;
  const averageDuration = latestRunForDay?.durationMs ?? undefined;
  const jobTypeLabel = isAllJobs
    ? "All jobs"
    : jobType === "RETENTION"
    ? "Event retention"
    : jobType === "REPLAY_AUDIT"
    ? "Replay audit retention"
    : "Job audit retention";
  const successLabel =
    jobType === "RETENTION"
      ? "Deleted (Success)"
      : jobType === "REPLAY_AUDIT"
      ? "Deleted (Jobs)"
      : "Deleted (Runs/Daily)";
  const failureLabel =
    jobType === "RETENTION"
      ? "Deleted (Failures)"
      : jobType === "REPLAY_AUDIT"
      ? "Deleted (Items)"
      : "Deleted (Items)";

  return (
    <section className="page page-compact job-audit">
      {error && <div className="banner error">Housekeeping failed: {error}</div>}
      {latestFailed && latestDaily ? (
        <div className="banner error">
          Latest cleanup failed on {latestDaily.runDate}. Review the run details and rerun.
        </div>
      ) : null}
      {failedHistory.length > 0 ? (
        <div className="banner error">
          Previous day failures: {failedHistory.map((row) => row.runDate).join(", ")}.
        </div>
      ) : null}
      {pendingAfterRun ? (
        <div className="banner info">
          Pending {pendingLabel} older than retention remain (
          {formatNumber(previewTotals?.deletedTotal ?? latestDaily?.eligibleTotal)}). Consider
          running again.
        </div>
      ) : null}

      <div className="job-type-bar">
        <div>
          <strong>Job Type</strong>
          <span>Choose which job scope to audit.</span>
        </div>
        <div className="job-type-actions">
          <div className="select">
            <span className="material-symbols-outlined">schedule</span>
            <select value={scopeSelection} onChange={(event) => setScopeSelection(event.target.value)}>
              <option value="ALL_JOBS">All jobs</option>
              {eventCatalog.map((event) => (
                <option key={event.eventKey} value={`event:${event.eventKey}`}>
                  Event - {event.name}
                </option>
              ))}
              <option value="REPLAY_AUDIT">Replay audit</option>
              <option value="HOUSEKEEPING_AUDIT">Job audit</option>
            </select>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          title="Last Run"
          value={latestRunForDay?.startedAt ? formatTimeAgo(latestRunForDay.startedAt) : "--"}
          icon="history"
          tone="neutral"
        />
        <KpiCard
          title="Deleted (Total)"
          value={formatNumber(totalDeleted)}
          icon="delete"
          tone="danger"
        />
        <KpiCard
          title={failureLabel}
          value={formatNumber(totalFailureDeleted)}
          icon="error"
          tone="danger"
        />
        <KpiCard
          title={successLabel}
          value={formatNumber(totalSuccessDeleted)}
          icon="check_circle"
          tone="success"
        />
        <KpiCard
          title="Avg Duration"
          value={formatLatency(averageDuration)}
          icon="timer"
          tone="info"
        />
        <KpiCard
          title="Ready to delete"
          value={formatNumber(previewTotals?.deletedTotal)}
          icon="schedule"
          tone="warning"
        />
        <KpiCard
          title="Cutoff date"
          value={previewTotals?.cutoffDate ?? "--"}
          icon="event"
          tone="neutral"
        />
      </div>

      <div className="panel job-preview">
        <div className="panel-header">
          <div>
            <h3>Next Run Preview</h3>
            <span>
              Records older than{" "}
              {previewTotals ? `${previewTotals.retentionDays} days` : "--"} - Cutoff{" "}
              {previewTotals?.cutoffDate ?? "--"}
            </span>
          </div>
          <div className="job-actions">
            <button
              className="button ghost small"
              type="button"
              onClick={() => loadPreview()}
              disabled={previewLoading}
            >
              {previewLoading ? "Refreshing..." : "Refresh preview"}
            </button>
          </div>
        </div>

        <div className="job-preview-grid">
          <div className="job-preview-card">
            <span>Total ready</span>
            <strong>{formatNumber(previewTotals?.deletedTotal)}</strong>
            <em>Snapshot {formatDateTime(previewTotals?.snapshotAt)}</em>
          </div>
          <div className="job-preview-card">
            <span>Failures ready</span>
            <strong>{formatNumber(previewTotals?.deletedFailure)}</strong>
            <em>{previewScope}</em>
          </div>
          <div className="job-preview-card">
            <span>Success ready</span>
            <strong>{formatNumber(previewTotals?.deletedSuccess)}</strong>
            <em>{previewScope}</em>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table-wide job-preview-table">
            <thead>
              <tr>
                <th>{previewLabel}</th>
                <th>Ready (Total)</th>
                <th>Ready (Failures)</th>
                <th>Ready (Success)</th>
                <th>Next scheduled</th>
              </tr>
            </thead>
            <tbody>
              {previewLoading ? (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    Loading preview counts...
                  </td>
                </tr>
              ) : previewEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    No preview data available yet.
                  </td>
                </tr>
              ) : (
                previewSlice.map((item) => (
                  <tr key={item.eventKey}>
                    <td>
                      <div className="cell-title">{getEventLabel(item.eventKey)}</div>
                      <div className="cell-sub">{item.eventKey}</div>
                    </td>
                    <td className="mono">{formatNumber(item.deletedTotal)}</td>
                    <td className="mono">{formatNumber(item.deletedFailure)}</td>
                    <td className="mono">{formatNumber(item.deletedSuccess)}</td>
                    <td className="mono">{formatDateTime(item.nextRunAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {previewEvents.length > previewPageSize ? (
          <div className="pager">
            <button
              className="button ghost small"
              type="button"
              disabled={!previewHasPrev}
              onClick={() => setPreviewPage((prev) => Math.max(0, prev - 1))}
            >
              Previous
            </button>
            <span className="mono">
              Page {previewPage + 1} of {previewPageCount}
            </span>
            <button
              className="button ghost small"
              type="button"
              disabled={!previewHasNext}
              onClick={() => setPreviewPage((prev) => prev + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>

      <div className="panel job-latest">
        <div className="panel-header">
          <div>
            <h3>Last Day Run</h3>
            <span>
              {selectedDaily
                ? `Run date ${selectedDaily.runDate} - attempts ${selectedDaily.lastAttempt || 0}`
                : "No cleanup runs recorded yet."}
            </span>
          </div>
          <div className="job-header-actions">
            {latestRunForDay ? (
              <div className="job-status">
                <span className={`tag ${statusTone}`}>{latestRunForDay.status}</span>
                <div>
                  <div className="cell-title mono">
                    {formatNumber(latestRunForDay.deletedTotal)} deleted
                  </div>
                  <div className="cell-sub">
                    S {formatNumber(latestRunForDay.deletedSuccess)} | F{" "}
                    {formatNumber(latestRunForDay.deletedFailure)}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="job-actions">
              <button
                className="button ghost small"
                type="button"
                onClick={() => {
                  loadDaily();
                  loadRunHistory();
                  loadStatus(selectedDate ?? undefined);
                }}
              >
                Refresh
              </button>
              <button
                className="button primary small"
                type="button"
                onClick={handleRunNow}
                disabled={running || !scopeSelection || isAllEvents}
              >
                {running ? "Running..." : "Run now"}
              </button>
            </div>
          </div>
        </div>

        <div className="job-summary-grid">
          <div className="job-summary-card">
            <span>Status</span>
            <strong>{latestRunForDay?.status ?? selectedDaily?.lastStatus ?? "--"}</strong>
            <em>Attempt {latestRunForDay?.attempt ?? selectedDaily?.lastAttempt ?? 0}</em>
          </div>
          <div className="job-summary-card">
            <span>Last started</span>
            <strong>{formatDateTime(latestRunForDay?.startedAt)}</strong>
            <em>{formatTimeAgo(latestRunForDay?.startedAt)}</em>
          </div>
          <div className="job-summary-card">
            <span>Duration</span>
            <strong>{formatLatency(latestRunForDay?.durationMs ?? undefined)}</strong>
            <em>Completed {formatTimeAgo(latestRunForDay?.completedAt)}</em>
          </div>
          <div className="job-summary-card">
            <span>Cutoff date</span>
            <strong>{selectedDaily?.cutoffDate ?? previewTotals?.cutoffDate ?? "--"}</strong>
            <em>Retention {selectedDaily?.retentionDays ?? previewTotals?.retentionDays ?? 7} days</em>
          </div>
          <div className="job-summary-card">
            <span>Trigger</span>
            <strong>{latestRunForDay?.triggerType ?? "--"}</strong>
            <em>{toDisplayValue(latestRunForDay?.jobType)}</em>
          </div>
        </div>

      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>Run History</h3>
            <span>{jobTypeLabel} runs grouped by event.</span>
          </div>
          <div className="job-actions">
            <button className="button ghost small" type="button" onClick={() => loadRunHistory()}>
              Refresh history
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table-wide job-table">
            <thead>
              <tr>
                <th>Run Date</th>
                <th>Event</th>
                <th>Attempts</th>
                <th>Status</th>
                <th>Deleted</th>
                <th>Duration</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {runsLoading ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    Loading run history...
                  </td>
                </tr>
              ) : runSummaries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No housekeeping runs recorded yet.
                  </td>
                </tr>
              ) : (
                runSummaries.map((row) => {
                  const rowKey = `${row.runDate}::${row.eventKey}`;
                  const isExpanded = !!expandedRows[rowKey];
                  const runsForDate = runsByDate[rowKey] ?? [];
                  const isLoading = runsByDateLoading[rowKey];
                  const attempts = runsForDate
                    .map((run) => {
                      const item = run.items?.find((entry) => entry.eventKey === row.eventKey);
                      if (!item) {
                        return null;
                      }
                      return { run, item };
                    })
                    .filter((entry): entry is { run: HousekeepingRun; item: HousekeepingRunItem } => !!entry)
                    .sort((a, b) => a.run.attempt - b.run.attempt);
                  const deletedBreakdown =
                    jobType === "RETENTION"
                      ? `S ${formatNumber(row.deletedSuccess)} | F ${formatNumber(row.deletedFailure)}`
                      : null;
                  return (
                    <Fragment key={rowKey}>
                      <tr>
                        <td className="mono">
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => toggleRow(row.runDate, row.eventKey)}
                          >
                            {row.runDate}
                          </button>
                        </td>
                        <td>
                          <div className="cell-title">{getEventLabel(row.eventKey)}</div>
                          <div className="cell-sub">{row.eventKey}</div>
                        </td>
                        <td className="mono">
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => toggleRow(row.runDate, row.eventKey)}
                          >
                            {row.attempts} {row.attempts === 1 ? "attempt" : "attempts"} -{" "}
                            {isExpanded ? "Hide" : "View"}
                          </button>
                        </td>
                        <td>
                          <span
                            className={`tag ${
                              row.latestStatus === "COMPLETED"
                                ? "success"
                                : row.latestStatus === "FAILED"
                                ? "danger"
                                : "warning"
                            }`}
                          >
                            {row.latestStatus ?? "--"}
                          </span>
                          {row.latestErrorMessage ? (
                            <div className="cell-sub">{row.latestErrorMessage}</div>
                          ) : null}
                        </td>
                        <td>
                          <div className="cell-title mono">{formatNumber(row.deletedTotal)}</div>
                          {deletedBreakdown ? <div className="cell-sub">{deletedBreakdown}</div> : null}
                        </td>
                        <td className="mono">
                          {row.latestDurationMs != null
                            ? formatLatency(row.latestDurationMs ?? undefined)
                            : "--"}
                        </td>
                        <td>
                          <div className="cell-title">{formatDateTime(row.latestCompletedAt)}</div>
                          <div className="cell-sub">{formatTimeAgo(row.latestCompletedAt)}</div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="job-expand">
                          <td colSpan={7}>
                            <div className="job-expand-inner">
                              <div className="job-expand-title">
                                Attempts for {getEventLabel(row.eventKey)} on {row.runDate}
                              </div>
                              <table className="job-expand-table">
                                <thead>
                                  <tr>
                                    <th>Attempt</th>
                                    <th>Status</th>
                                    <th>Deleted</th>
                                    <th>Duration</th>
                                    <th>Completed</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {isLoading ? (
                                    <tr>
                                      <td colSpan={5} className="empty-cell">
                                        Loading attempts...
                                      </td>
                                    </tr>
                                  ) : attempts.length === 0 ? (
                                    <tr>
                                      <td colSpan={5} className="empty-cell">
                                        No attempts recorded for this event.
                                      </td>
                                    </tr>
                                  ) : (
                                    attempts.map(({ run, item }) => (
                                      <tr key={run.id}>
                                        <td className="mono">#{run.attempt}</td>
                                        <td>
                                          <span
                                            className={`tag ${
                                              run.status === "COMPLETED"
                                                ? "success"
                                                : run.status === "FAILED"
                                                ? "danger"
                                                : "warning"
                                            }`}
                                          >
                                            {run.status}
                                          </span>
                                          {run.errorMessage ? (
                                            <div className="cell-sub">{run.errorMessage}</div>
                                          ) : null}
                                        </td>
                                        <td>
                                          <div className="cell-title mono">
                                            {formatNumber(item.deletedTotal)}
                                          </div>
                                          <div className="cell-sub">
                                            S {formatNumber(item.deletedSuccess)} | F{" "}
                                            {formatNumber(item.deletedFailure)}
                                          </div>
                                        </td>
                                        <td className="mono">
                                          {run.durationMs != null
                                            ? formatLatency(run.durationMs ?? undefined)
                                            : "--"}
                                        </td>
                                        <td>
                                          <div className="cell-title">
                                            {formatDateTime(run.completedAt)}
                                          </div>
                                          <div className="cell-sub">
                                            {formatTimeAgo(run.completedAt)}
                                          </div>
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <button
            className="button ghost small"
            type="button"
            disabled={historyPage === 0}
            onClick={() => setHistoryPage((prev) => Math.max(0, prev - 1))}
          >
            Previous
          </button>
          <span className="mono">Page {historyPage + 1}</span>
          <button
            className="button ghost small"
            type="button"
            disabled={!historyHasNext}
            onClick={() => setHistoryPage((prev) => prev + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
