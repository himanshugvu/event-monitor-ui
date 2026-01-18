import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "../api/client";
import { KpiCard } from "../components/KpiCard";
import { formatDateTime, formatLatency, formatNumber, formatPercent, formatTimeAgo, toDisplayValue } from "../utils/format";
import { buildQuery } from "../utils/query";

type ReplayJob = {
  replayId: string;
  eventKey: string;
  selectionType: string;
  totalRequested: number;
  status: string;
  requestedBy?: string | null;
  reason?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
  succeeded: number;
  failed: number;
  queued: number;
};

type ReplayJobItem = {
  recordId: number;
  status: string;
  attemptCount: number;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  emittedId?: string | null;
  traceId?: string | null;
  messageKey?: string | null;
  accountNumber?: string | null;
  exceptionType?: string | null;
  eventDatetime?: string | null;
};

type ReplayAuditStats = {
  total: number;
  replayed: number;
  failed: number;
  queued: number;
  avgDurationMs?: number | null;
  latestAt?: string | null;
};

type ReplayJobListResponse = {
  jobs: ReplayJob[];
  page: number;
  size: number;
  total: number;
  stats?: ReplayAuditStats | null;
  operators?: string[];
  eventKeys?: string[];
};

type ReplayJobItemsResponse = {
  items: ReplayJobItem[];
};

type ItemState = {
  loading: boolean;
  error: string | null;
  items: ReplayJobItem[];
};

const defaultFilters = {
  search: "",
  status: "all",
  eventKey: "all",
  requestedBy: "all",
};

const statusTag = (status: string) => {
  if (status === "COMPLETED" || status === "REPLAYED") {
    return "success";
  }
  if (status === "FAILED") {
    return "danger";
  }
  if (status === "PARTIAL") {
    return "warning";
  }
  return "warning";
};

export function ReplayAuditScreen() {
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [jobs, setJobs] = useState<ReplayJob[]>([]);
  const [stats, setStats] = useState<ReplayAuditStats | null>(null);
  const [operators, setOperators] = useState<string[]>([]);
  const [eventKeys, setEventKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [itemsByJob, setItemsByJob] = useState<Record<string, ItemState>>({});
  const [activeJob, setActiveJob] = useState<ReplayJob | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [itemPage, setItemPage] = useState(0);
  const itemPageSize = 12;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = buildQuery({
      search: appliedFilters.search || undefined,
      status: appliedFilters.status === "all" ? undefined : appliedFilters.status,
      eventKey: appliedFilters.eventKey === "all" ? undefined : appliedFilters.eventKey,
      requestedBy: appliedFilters.requestedBy === "all" ? undefined : appliedFilters.requestedBy,
      page,
      size: pageSize,
    });
    fetchJson<ReplayJobListResponse>(`/api/v1/replay-jobs${query}`, controller.signal)
      .then((data) => {
        setJobs(data.jobs ?? []);
        setStats(data.stats ?? null);
        setOperators((data.operators ?? []).filter(Boolean));
        setEventKeys((data.eventKeys ?? []).filter(Boolean));
        setTotal(Number.isFinite(data.total) ? data.total : 0);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [appliedFilters, page, pageSize]);

  const totalItems = stats?.total ?? 0;
  const succeeded = stats?.replayed ?? 0;
  const failed = stats?.failed ?? 0;
  const queued = stats?.queued ?? 0;
  const avgDuration = stats?.avgDurationMs ?? 0;
  const successRate = totalItems > 0 ? (succeeded / totalItems) * 100 : 0;
  const updatedAt = stats?.latestAt ?? new Date().toISOString();

  const operatorOptions = useMemo(
    () => ["all", ...operators.filter((value) => value && value !== "all")],
    [operators]
  );
  const eventOptions = useMemo(
    () => ["all", ...eventKeys.filter((value) => value && value !== "all")],
    [eventKeys]
  );

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;

  const applyFilters = () => {
    setPage(0);
    setAppliedFilters(filters);
  };
  const clearFilters = () => {
    setPage(0);
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const openJob = (job: ReplayJob) => {
    setActiveJob(job);
    setItemSearch("");
    setItemPage(0);
    if (itemsByJob[job.replayId]?.items?.length || itemsByJob[job.replayId]?.loading) {
      return;
    }
    setItemsByJob((current) => ({
      ...current,
      [job.replayId]: { loading: true, error: null, items: [] },
    }));
    fetchJson<ReplayJobItemsResponse>(`/api/v1/replay-jobs/${job.replayId}/items`)
      .then((data) => {
        setItemsByJob((current) => ({
          ...current,
          [job.replayId]: { loading: false, error: null, items: data.items ?? [] },
        }));
      })
      .catch((err) => {
        setItemsByJob((current) => ({
          ...current,
          [job.replayId]: {
            loading: false,
            error: err instanceof Error ? err.message : String(err),
            items: [],
          },
        }));
      });
  };

  const closeJob = () => {
    setActiveJob(null);
    setItemSearch("");
    setItemPage(0);
  };

  const activeItems = activeJob ? itemsByJob[activeJob.replayId]?.items ?? [] : [];
  const filteredItems = useMemo(() => {
    if (!itemSearch) {
      return activeItems;
    }
    const lowered = itemSearch.toLowerCase();
    return activeItems.filter((item) => {
      const values = [
        String(item.recordId),
        item.traceId,
        item.messageKey,
        item.accountNumber,
      ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return values.some((value) => value.includes(lowered));
    });
  }, [activeItems, itemSearch]);
  const itemTotalPages = filteredItems.length > 0 ? Math.ceil(filteredItems.length / itemPageSize) : 1;
  const itemStart = itemPage * itemPageSize;
  const itemSlice = filteredItems.slice(itemStart, itemStart + itemPageSize);

  return (
    <section className="page page-compact replay-audit">
      <div className="kpi-grid">
        <KpiCard title="Total Replays" value={formatNumber(totalItems)} icon="history" tone="neutral" />
        <KpiCard title="Replayed" value={formatNumber(succeeded)} icon="check_circle" tone="success" />
        <KpiCard title="Failed" value={formatNumber(failed)} icon="error" tone="danger" />
        <KpiCard title="Queued" value={formatNumber(queued)} icon="schedule" tone="warning" />
        <KpiCard title="Success Rate" value={formatPercent(successRate)} icon="percent" tone="success" />
        <KpiCard title="Avg Replay Time" value={formatLatency(avgDuration)} icon="timer" tone="info" />
      </div>

      <div className="panel audit-panel">
        <div className="panel-header">
          <div>
            <h3>Replay Audit Trail</h3>
            <span>Every replay request captured with outcome and operator context.</span>
          </div>
          <div className="audit-meta">
            <span className="tag neutral">Latest {formatTimeAgo(updatedAt)}</span>
            <span className="muted mono">{formatDateTime(updatedAt)}</span>
          </div>
        </div>

        <div className="filter-panel">
          <div className="audit-filter-grid">
            <div className="field">
              <label>Search</label>
              <div className="search">
                <span className="material-symbols-outlined">search</span>
                <input
                  placeholder="Replay ID"
                  type="text"
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                />
              </div>
            </div>
            <div className="field">
              <label>Status</label>
              <div className="select">
                <span className="material-symbols-outlined">tune</span>
                <select
                  value={filters.status}
                  onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                >
                  <option value="all">All results</option>
                  <option value="REPLAYED">Replayed</option>
                  <option value="FAILED">Failed</option>
                  <option value="QUEUED">Queued</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Event</label>
              <div className="select">
                <span className="material-symbols-outlined">filter_list</span>
                <select
                  value={filters.eventKey}
                  onChange={(event) => setFilters((current) => ({ ...current, eventKey: event.target.value }))}
                >
                  {eventOptions.map((eventKey) => (
                    <option key={eventKey} value={eventKey}>
                      {eventKey === "all" ? "All events" : eventKey}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Requested by</label>
              <div className="select">
                <span className="material-symbols-outlined">person</span>
                <select
                  value={filters.requestedBy}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, requestedBy: event.target.value }))
                  }
                >
                  {operatorOptions.map((operator) => (
                    <option key={operator} value={operator}>
                      {operator === "all" ? "All operators" : operator}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="filter-actions inline-actions">
              <button className="button ghost small" type="button" onClick={clearFilters}>
                Clear
              </button>
              <button className="button primary small" type="button" onClick={applyFilters}>
                Apply
              </button>
            </div>
          </div>
        </div>

        {error && <div className="banner error">Replay audit failed: {error}</div>}

        <div className="table-wrap">
          <table className="table-wide audit-table">
            <thead>
              <tr>
                <th>Replay</th>
                <th>Event</th>
                <th>Status</th>
                <th>Items</th>
                <th>Requested by</th>
                <th>Replay Time</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    Loading replays...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No replays captured yet.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.replayId}>
                    <td>
                      <button className="link-button mono" type="button" onClick={() => openJob(job)}>
                        {job.replayId}
                      </button>
                      <div className="cell-sub">{toDisplayValue(job.selectionType)}</div>
                    </td>
                    <td>
                      <div className="cell-title">{job.eventKey}</div>
                      <div className="cell-sub">{formatNumber(job.totalRequested)} requested</div>
                    </td>
                    <td>
                      <span className={`tag ${statusTag(job.status)}`}>{job.status}</span>
                      <div className="cell-sub">
                        S {formatNumber(job.succeeded)} | F {formatNumber(job.failed)} | Q {formatNumber(job.queued)}
                      </div>
                    </td>
                    <td className="mono">{formatNumber(job.totalRequested)}</td>
                    <td>
                      <div className="cell-title">{toDisplayValue(job.requestedBy)}</div>
                      <div className="cell-sub">Manual</div>
                    </td>
                    <td>
                      <div className="cell-title">{formatDateTime(job.completedAt ?? job.createdAt)}</div>
                      <div className="cell-sub">{formatTimeAgo(job.completedAt ?? job.createdAt)}</div>
                    </td>
                    <td>{toDisplayValue(job.reason)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="pager">
            <button className="button ghost small" type="button" disabled={!canPrev} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span className="mono">
              Page {Math.min(page + 1, totalPages)} of {totalPages}
            </span>
            <button className="button ghost small" type="button" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </div>
      {activeJob ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="replay-items-title">
          <div className="modal-backdrop" onClick={closeJob} role="presentation" />
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3 id="replay-items-title">Replay {activeJob.replayId}</h3>
                <div className="modal-meta">
                  <span className="tag neutral">{activeJob.eventKey}</span>
                  <span className="tag">{toDisplayValue(activeJob.selectionType)}</span>
                  <span className={`tag ${statusTag(activeJob.status)}`}>{activeJob.status}</span>
                </div>
              </div>
              <button className="icon-button" type="button" onClick={closeJob} aria-label="Close replay items">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="meta-grid">
                <div className="meta-card">
                  <span>Requested</span>
                  <strong>{formatNumber(activeJob.totalRequested)}</strong>
                </div>
                <div className="meta-card">
                  <span>Replayed</span>
                  <strong>{formatNumber(activeJob.succeeded)}</strong>
                </div>
                <div className="meta-card">
                  <span>Failed</span>
                  <strong>{formatNumber(activeJob.failed)}</strong>
                </div>
                <div className="meta-card">
                  <span>Queued</span>
                  <strong>{formatNumber(activeJob.queued)}</strong>
                </div>
                <div className="meta-card">
                  <span>Requested by</span>
                  <strong>{toDisplayValue(activeJob.requestedBy)}</strong>
                </div>
                <div className="meta-card">
                  <span>Completed</span>
                  <strong>{formatDateTime(activeJob.completedAt ?? activeJob.createdAt)}</strong>
                </div>
              </div>

              <div className="section">
                <div className="audit-filter-grid modal-filter-grid">
                  <div className="field">
                    <label>Search items</label>
                    <div className="search">
                      <span className="material-symbols-outlined">search</span>
                      <input
                        placeholder="Record ID, trace, message key"
                        type="text"
                        value={itemSearch}
                        onChange={(event) => {
                          setItemSearch(event.target.value);
                          setItemPage(0);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {itemsByJob[activeJob.replayId]?.loading ? (
                <div className="empty-cell">Loading replayed items...</div>
              ) : itemsByJob[activeJob.replayId]?.error ? (
                <div className="banner error">Failed to load items: {itemsByJob[activeJob.replayId]?.error}</div>
              ) : filteredItems.length ? (
                <>
                  <table className="table-wide replay-item-table">
                    <thead>
                      <tr>
                        <th>Record ID</th>
                        <th>Status</th>
                        <th>Attempt</th>
                        <th>Last Attempt</th>
                        <th>Trace</th>
                        <th>Message Key</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemSlice.map((item) => (
                        <tr key={`${activeJob.replayId}-${item.recordId}`}>
                          <td className="mono">{formatNumber(item.recordId)}</td>
                          <td>
                            <span className={`tag ${statusTag(item.status)}`}>{item.status}</span>
                          </td>
                          <td className="mono">{formatNumber(item.attemptCount)}</td>
                          <td>
                            <div className="cell-title">{formatDateTime(item.lastAttemptAt)}</div>
                            <div className="cell-sub">{formatTimeAgo(item.lastAttemptAt)}</div>
                          </td>
                          <td className="mono">{toDisplayValue(item.traceId)}</td>
                          <td className="mono">{toDisplayValue(item.messageKey)}</td>
                          <td className="cell-sub">{toDisplayValue(item.lastError || item.emittedId)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {itemTotalPages > 1 ? (
                    <div className="pager">
                      <button
                        className="button ghost small"
                        type="button"
                        disabled={itemPage <= 0}
                        onClick={() => setItemPage((value) => Math.max(0, value - 1))}
                      >
                        Previous
                      </button>
                      <span className="mono">
                        Page {Math.min(itemPage + 1, itemTotalPages)} of {itemTotalPages}
                      </span>
                      <button
                        className="button ghost small"
                        type="button"
                        disabled={itemPage >= itemTotalPages - 1}
                        onClick={() => setItemPage((value) => value + 1)}
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="empty-cell">No replayed items for this request.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
