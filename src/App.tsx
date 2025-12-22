import { type ReactNode, useEffect, useMemo, useState } from "react";

type ThemeMode = "light" | "dark";
type ScreenMode = "home" | "event";
type StatusTone = "healthy" | "warning" | "critical";
type DayMode = "today" | "yesterday" | "custom";

type Kpis = {
  total: number;
  success: number;
  failure: number;
  successRate: number;
  retriableFailures: number;
  avgLatencyMs: number;
};

type EventBreakdownRow = {
  eventKey: string;
  total: number;
  success: number;
  failure: number;
  successRate: number;
  retriableFailures: number;
  avgLatencyMs: number;
};

type HomeAggregationResponse = {
  day: string;
  generatedAt: string;
  kpis: Kpis;
  events: EventBreakdownRow[];
};

type EventSummaryResponse = {
  day: string;
  eventKey: string;
  generatedAt: string;
  kpis: Kpis;
};

type BucketPoint = {
  bucketStart: string;
  success: number;
  failure: number;
  total: number;
  successRate: number;
  retriableFailures: number;
  avgLatencyMs: number;
};

type EventBucketsResponse = {
  day: string;
  eventKey: string;
  intervalMinutes: number;
  generatedAt: string;
  buckets: BucketPoint[];
};

type SuccessRow = {
  id?: number;
  event_trace_id?: string;
  account_number?: string;
  customer_type?: string;
  event_received_timestamp?: unknown;
  source_topic?: string;
  source_partition_id?: number;
  source_offset?: number;
  message_key?: string;
  source_payload?: string;
  transformed_payload?: string;
  event_sent_timestamp?: unknown;
  target_topic?: string;
  target_partition_id?: number;
  target_offset?: number;
};

type FailureRow = SuccessRow & {
  exception_type?: string;
  exception_message?: string;
  exception_stack?: string;
  retriable?: number;
  retry_attempt?: number;
};

type PagedRowsResponse<T> = {
  page: number;
  size: number;
  rows: T[];
};

type EventMeta = {
  name: string;
  category: string;
};

type EventRow = EventBreakdownRow & {
  name: string;
  category: string;
  status: StatusTone;
};

const EVENT_META: Record<string, EventMeta> = {
  "payments.in": { name: "PaymentAuthorized", category: "Commerce / Payments" },
  "loans.in": { name: "LoanDisbursed", category: "Lending / Core" },
  "cards.in": { name: "CardActivated", category: "Cards / Lifecycle" },
  "accounts.in": { name: "AccountOpened", category: "Accounts / Core" },
  "transfers.in": { name: "TransferCompleted", category: "Transfers / Payments" },
  "alerts.in": { name: "AlertTriggered", category: "Monitoring / Alerts" },
};

const EVENT_KEYS = Object.keys(EVENT_META);
const THEME_STORAGE_KEY = "event-monitor-ui-theme";
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

const statusLabels: Record<StatusTone, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
};

const getInitialTheme = (): ThemeMode => {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
};

const toLocalDayString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatNumber = (value?: number) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return new Intl.NumberFormat("en-US").format(value);
};

const formatPercent = (value?: number) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(2)}%`;
};

const formatLatency = (value?: number) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return `${Math.round(value)}ms`;
};

const parseDate = (value?: unknown) => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "number") {
    return new Date(value);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateTime = (value?: unknown) => {
  const date = parseDate(value);
  if (!date) {
    return "--";
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

const formatTimeAgo = (value?: unknown) => {
  const date = parseDate(value);
  if (!date) {
    return "unknown";
  }
  const diffMs = Date.now() - date.getTime();
  if (diffMs <= 0) {
    return "just now";
  }
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const getStatusTone = (successRate?: number): StatusTone => {
  if (successRate === null || successRate === undefined || Number.isNaN(successRate)) {
    return "warning";
  }
  if (successRate >= 99.5) {
    return "healthy";
  }
  if (successRate >= 95) {
    return "warning";
  }
  return "critical";
};

const buildQuery = (params: Record<string, string | number | boolean | null | undefined>) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
};

const resolveSearch = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { traceId: undefined, messageKey: undefined };
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("msg:")) {
    const messageKey = trimmed.slice(4).trim();
    return { traceId: undefined, messageKey: messageKey || undefined };
  }
  return { traceId: trimmed, messageKey: undefined };
};

const getEventMeta = (eventKey: string): EventMeta => {
  return EVENT_META[eventKey] ?? { name: eventKey, category: "Uncategorized" };
};

const formatPayload = (value?: string) => {
  if (!value) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

const toDisplayValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  return String(value);
};

const calculateLatencyMs = (row: SuccessRow | FailureRow) => {
  const received = parseDate(row.event_received_timestamp);
  const sent = parseDate(row.event_sent_timestamp);
  if (!received || !sent) {
    return null;
  }
  return Math.max(0, sent.getTime() - received.getTime());
};

const isAbortError = (error: unknown) => {
  return error instanceof Error && error.name === "AbortError";
};

const getAxisLabels = (buckets: BucketPoint[], labelCount = 7) => {
  if (!buckets.length) {
    return [];
  }
  const safeCount = Math.max(2, labelCount);
  const lastIndex = buckets.length - 1;
  const positions = Array.from({ length: safeCount }, (_, index) =>
    Math.round((lastIndex * index) / (safeCount - 1))
  );
  return positions.map((index) => {
    const labelDate = parseDate(buckets[index]?.bucketStart);
    if (!labelDate) {
      return "--:--";
    }
    const hours = String(labelDate.getHours()).padStart(2, "0");
    const minutes = String(labelDate.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  });
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const buildLinePath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) {
    return "";
  }
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
};

const buildAreaPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) {
    return "";
  }
  const start = points[0];
  const end = points[points.length - 1];
  return `${buildLinePath(points)} L ${end.x} 100 L ${start.x} 100 Z`;
};

const formatTooltipTime = (value?: unknown) => {
  const date = parseDate(value);
  if (!date) {
    return "--:--";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      if (data && typeof data.message === "string") {
        message = data.message;
      }
    } catch {
      // keep fallback
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [screen, setScreen] = useState<ScreenMode>("home");
  const [dayMode, setDayMode] = useState<DayMode>("today");
  const [day, setDay] = useState(() => toLocalDayString(new Date()));
  const [selectedEvent, setSelectedEvent] = useState<string>(EVENT_KEYS[0] ?? "");
  const activeMeta = getEventMeta(selectedEvent);
  const headerTitle = screen === "home" ? "Home - Global Aggregation" : `Event Details - ${activeMeta.name}`;
  const headerSub = screen === "home" ? "Dashboard" : "Events Log";
  const navItems = [
    { id: "home", label: "Global Aggregation", icon: "dashboard", screen: "home" as ScreenMode },
    { id: "event", label: "Events Log", icon: "list", screen: "event" as ScreenMode },
    { id: "failures", label: "Failure Analysis", icon: "bug_report", screen: "event" as ScreenMode },
    { id: "settings", label: "Settings", icon: "settings", screen: null },
  ];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (dayMode === "today") {
      setDay(toLocalDayString(new Date()));
    } else if (dayMode === "yesterday") {
      setDay(toLocalDayString(new Date(Date.now() - 24 * 60 * 60 * 1000)));
    }
  }, [dayMode]);

  return (
    <div className="layout auto-sidebar">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-badge">
            <span className="material-symbols-outlined">monitor_heart</span>
          </div>
          <span className="sidebar-text">EventMonitor</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = item.screen === screen;
            return (
              <button
                key={item.id}
                className={isActive ? "sidebar-link active" : "sidebar-link"}
                onClick={() => {
                  if (item.screen) {
                    setScreen(item.screen);
                  }
                }}
                aria-current={isActive ? "page" : undefined}
                type="button"
                title={item.label}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="sidebar-text">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar-circle">
            <span className="material-symbols-outlined">person</span>
          </div>
          <div className="sidebar-meta">
            <div className="sidebar-user">Admin User</div>
            <div className="sidebar-email">admin@eventflow.com</div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="top-header">
          <div className="header-left">
            <h1>{headerTitle}</h1>
            <span className="header-sep">/</span>
            <span className="header-sub">{headerSub}</span>
          </div>
          <div className="header-actions">
            <button className="icon-button" aria-label="Search">
              <span className="material-symbols-outlined">search</span>
            </button>
            <button className="icon-button notify" aria-label="Notifications">
              <span className="material-symbols-outlined">notifications</span>
              <span className="notify-dot" />
            </button>
            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={() => setTheme((mode) => (mode === "light" ? "dark" : "light"))}
            >
              <span className="material-symbols-outlined">
                {theme === "light" ? "dark_mode" : "light_mode"}
              </span>
            </button>
          </div>
        </header>
        <div className="content">
          {screen === "home" ? (
            <HomeScreen
              day={day}
              onOpenEvent={(eventKey) => {
                setSelectedEvent(eventKey);
                setScreen("event");
              }}
            />
          ) : (
            <EventDetailsScreen
              day={day}
              dayMode={dayMode}
              onDayModeChange={setDayMode}
              onDayChange={setDay}
              selectedEvent={selectedEvent}
              onSelectEvent={setSelectedEvent}
            />
          )}
        </div>
      </main>
    </div>
  );
}

type HomeScreenProps = {
  day: string;
  onOpenEvent: (eventKey: string) => void;
};

function HomeScreen({ day, onOpenEvent }: HomeScreenProps) {
  const [home, setHome] = useState<HomeAggregationResponse | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeBuckets, setHomeBuckets] = useState<BucketPoint[] | null>(null);
  const [homeBucketsLoading, setHomeBucketsLoading] = useState(false);
  const [homeBucketsError, setHomeBucketsError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setHomeLoading(true);
    setHomeError(null);
    fetchJson<HomeAggregationResponse>(`/api/v1/days/${day}/home`, controller.signal)
      .then((data) => {
        setHome(data);
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setHomeError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setHomeLoading(false);
        }
      });
    return () => controller.abort();
  }, [day]);

  useEffect(() => {
    if (!home) {
      setHomeBuckets(null);
      return;
    }
    const eventKeys = home.events.map((event) => event.eventKey);
    if (!eventKeys.length) {
      setHomeBuckets([]);
      return;
    }
    const controller = new AbortController();
    setHomeBucketsLoading(true);
    setHomeBucketsError(null);
    Promise.all(
      eventKeys.map((eventKey) =>
        fetchJson<EventBucketsResponse>(
          `/api/v1/days/${day}/events/${eventKey}/buckets?intervalMinutes=60`,
          controller.signal
        )
      )
    )
      .then((responses) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!responses.length) {
          setHomeBuckets([]);
          return;
        }
        const bucketCount = responses[0].buckets.length;
        const aggregated: BucketPoint[] = [];
        for (let i = 0; i < bucketCount; i += 1) {
          let success = 0;
          let failure = 0;
          let total = 0;
          let retriable = 0;
          let weightedLatency = 0;
          let weightedSuccess = 0;
          responses.forEach((response) => {
            const bucket = response.buckets[i];
            if (!bucket) {
              return;
            }
            success += bucket.success;
            failure += bucket.failure;
            total += bucket.total;
            retriable += bucket.retriableFailures;
            weightedLatency += bucket.avgLatencyMs * bucket.success;
            weightedSuccess += bucket.success;
          });
          const avgLatencyMs = weightedSuccess > 0 ? weightedLatency / weightedSuccess : 0;
          const successRate = total > 0 ? (success * 100) / total : 0;
          aggregated.push({
            bucketStart: responses[0].buckets[i]?.bucketStart ?? "",
            success,
            failure,
            total,
            successRate: Math.round(successRate * 100) / 100,
            retriableFailures: retriable,
            avgLatencyMs: Math.round(avgLatencyMs * 100) / 100,
          });
        }
        setHomeBuckets(aggregated);
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setHomeBucketsError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setHomeBucketsLoading(false);
        }
      });
    return () => controller.abort();
  }, [home, day]);

  const eventRows = useMemo<EventRow[]>(() => {
    if (!home) {
      return [];
    }
    return home.events.map((event) => {
      const meta = getEventMeta(event.eventKey);
      return {
        ...event,
        name: meta.name,
        category: meta.category,
        status: getStatusTone(event.successRate),
      };
    });
  }, [home]);

  const alertSummary = useMemo(() => {
    let critical = 0;
    let warning = 0;
    eventRows.forEach((event) => {
      if (event.status === "critical") {
        critical += 1;
      } else if (event.status === "warning") {
        warning += 1;
      }
    });
    return { critical, warning, total: critical + warning };
  }, [eventRows]);

  const failureInsights = useMemo(() => {
    if (!home) {
      return [];
    }
    return [...home.events]
      .filter((event) => event.failure > 0)
      .sort((a, b) => b.failure - a.failure)
      .slice(0, 3)
      .map((event) => {
        const meta = getEventMeta(event.eventKey);
        return {
          tone: getStatusTone(event.successRate),
          title: `${meta.name} failure spike`,
          detail: `${formatNumber(event.failure)} failures, ${formatNumber(
            event.retriableFailures
          )} retriable`,
          rate: event.successRate,
        };
      });
  }, [home]);

  const chartBuckets = homeBuckets ?? [];
  const primaryEventKey = eventRows[0]?.eventKey ?? EVENT_KEYS[0] ?? "";
  const canOpenInsights = primaryEventKey.length > 0;

  return (
    <section className="home">
      {homeError && <div className="banner error">Failed to load home data: {homeError}</div>}

      <div className="kpi-grid">
        <KpiCard title="Total Events" value={home ? formatNumber(home.kpis.total) : "--"} icon="functions" tone="neutral">
          <div className="kpi-trend success">
            <span className="material-symbols-outlined">trending_up</span>
            {home ? "+12% from last hour" : "Loading trend"}
          </div>
        </KpiCard>
        <KpiCard
          title="Success Rate"
          value={home ? formatPercent(home.kpis.successRate) : "--"}
          icon="check_circle"
          tone="success"
        >
          <div className="kpi-trend success">
            <span className="material-symbols-outlined">trending_up</span>
            {home ? "Stable" : "Loading trend"}
          </div>
        </KpiCard>
        <KpiCard
          title="Avg Latency"
          value={home ? formatLatency(home.kpis.avgLatencyMs) : "--"}
          icon="timer"
          tone="info"
        >
          <div className="kpi-trend latency">
            <span className="material-symbols-outlined">trending_flat</span>
            {home ? "+2ms increase" : "Loading trend"}
          </div>
        </KpiCard>
        <KpiCard
          title="Active Alerts"
          value={home ? String(alertSummary.total) : "--"}
          icon="warning"
          tone="danger"
        >
          <div className="kpi-trend danger">
            <span className="material-symbols-outlined">priority_high</span>
            {home ? `${alertSummary.critical} critical` : "Loading alerts"}
          </div>
        </KpiCard>
      </div>

      <HourlyTrendsPanel
        title="Hourly Trends"
        subtitle="Monitoring success, failure rates, and latency correlation"
        buckets={chartBuckets}
        loading={homeBucketsLoading || homeLoading}
        error={homeBucketsError}
      />

      <div className="home-grid">
        <div className="card table-card">
          <div className="card-header">
            <h3>All Events Breakdown</h3>
            <button className="link-button" type="button">
              Export
              <span className="material-symbols-outlined">download</span>
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Volume</th>
                  <th>Success Rate</th>
                  <th>Latency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {eventRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      No events available for this day.
                    </td>
                  </tr>
                ) : (
                  eventRows.map((event) => (
                    <tr key={event.eventKey} className="clickable" onClick={() => onOpenEvent(event.eventKey)}>
                      <td>
                        <div className="cell-title">{event.name}</div>
                        <div className="cell-sub">{event.category}</div>
                      </td>
                      <td className="mono">{formatNumber(event.total)}</td>
                      <td className="mono">{formatPercent(event.successRate)}</td>
                      <td className="mono">{formatLatency(event.avgLatencyMs)}</td>
                      <td>
                        <StatusBadge tone={event.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card insights-card">
          <div className="card-header danger">
            <h3>
              <span className="material-symbols-outlined">analytics</span>
              Failure Insights
            </h3>
          </div>
          <div className="insights-body">
            {failureInsights.length === 0 ? (
              <div className="empty-state">No failures detected yet.</div>
            ) : (
              failureInsights.map((insight) => (
                <div key={insight.title} className="insight-item">
                  <span className="material-symbols-outlined">warning</span>
                  <div>
                    <div className="insight-title">{insight.title}</div>
                    <p>{insight.detail}</p>
                  </div>
                </div>
              ))
            )}
            <button
              className="button ghost small"
              onClick={() => onOpenEvent(primaryEventKey)}
              type="button"
              disabled={!canOpenInsights}
            >
              View All Insights
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

type EventDetailsScreenProps = {
  day: string;
  dayMode: DayMode;
  onDayModeChange: (value: DayMode) => void;
  onDayChange: (value: string) => void;
  selectedEvent: string;
  onSelectEvent: (value: string) => void;
};

function EventDetailsScreen({
  day,
  onDayModeChange,
  onDayChange,
  selectedEvent,
  onSelectEvent,
}: EventDetailsScreenProps) {
  const [summary, setSummary] = useState<EventSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<EventBucketsResponse | null>(null);
  const [bucketsLoading, setBucketsLoading] = useState(false);
  const [bucketsError, setBucketsError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [bucketInterval, setBucketInterval] = useState(60);
  const [tab, setTab] = useState<"success" | "failures">("failures");
  const [searchTerm, setSearchTerm] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [exceptionType, setExceptionType] = useState("");
  const [retriable, setRetriable] = useState<"all" | "true" | "false">("all");
  const [successPage, setSuccessPage] = useState(0);
  const [failurePage, setFailurePage] = useState(0);
  const [successRows, setSuccessRows] = useState<SuccessRow[]>([]);
  const [failureRows, setFailureRows] = useState<FailureRow[]>([]);
  const [successLoading, setSuccessLoading] = useState(false);
  const [failureLoading, setFailureLoading] = useState(false);
  const [successError, setSuccessError] = useState<string | null>(null);
  const [failureError, setFailureError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<SuccessRow | FailureRow | null>(null);
  const pageSize = 50;
  const meta = getEventMeta(selectedEvent);
  const eventOptions = useMemo(() => {
    const set = new Set(EVENT_KEYS);
    if (selectedEvent) {
      set.add(selectedEvent);
    }
    return Array.from(set);
  }, [selectedEvent]);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryLoading(true);
    setSummaryError(null);
    fetchJson<EventSummaryResponse>(
      `/api/v1/days/${day}/events/${selectedEvent}/summary`,
      controller.signal
    )
      .then((data) => {
        setSummary(data);
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setSummaryError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSummaryLoading(false);
        }
      });
    return () => controller.abort();
  }, [day, selectedEvent, refreshIndex]);

  useEffect(() => {
    const controller = new AbortController();
    setBucketsLoading(true);
    setBucketsError(null);
    fetchJson<EventBucketsResponse>(
      `/api/v1/days/${day}/events/${selectedEvent}/buckets?intervalMinutes=${bucketInterval}`,
      controller.signal
    )
      .then((data) => {
        setBuckets(data);
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setBucketsError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBucketsLoading(false);
        }
      });
    return () => controller.abort();
  }, [day, selectedEvent, bucketInterval, refreshIndex]);

  useEffect(() => {
    setTab("failures");
    setSearchTerm("");
    setAccountNumber("");
    setExceptionType("");
    setRetriable("all");
    setSuccessPage(0);
    setFailurePage(0);
    setDrawerOpen(false);
    setSelectedRow(null);
  }, [selectedEvent, day]);

  useEffect(() => {
    if (summary?.kpis.failure === 0 && tab === "failures") {
      setTab("success");
    }
  }, [summary?.kpis.failure, tab]);

  useEffect(() => {
    if (tab !== "success") {
      return;
    }
    const controller = new AbortController();
    setSuccessLoading(true);
    setSuccessError(null);
    const { traceId, messageKey } = resolveSearch(searchTerm);
    const query = buildQuery({
      page: successPage,
      size: pageSize,
      traceId,
      messageKey,
      accountNumber: accountNumber.trim(),
    });
    fetchJson<PagedRowsResponse<SuccessRow>>(
      `/api/v1/days/${day}/events/${selectedEvent}/success${query}`,
      controller.signal
    )
      .then((data) => {
        setSuccessRows(data.rows ?? []);
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setSuccessError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSuccessLoading(false);
        }
      });
    return () => controller.abort();
  }, [tab, day, selectedEvent, successPage, searchTerm, accountNumber]);

  useEffect(() => {
    if (tab !== "failures") {
      return;
    }
    const controller = new AbortController();
    setFailureLoading(true);
    setFailureError(null);
    const { traceId, messageKey } = resolveSearch(searchTerm);
    const query = buildQuery({
      page: failurePage,
      size: pageSize,
      traceId,
      messageKey,
      accountNumber: accountNumber.trim(),
      exceptionType: exceptionType.trim(),
      retriable:
        retriable === "all" ? undefined : retriable === "true" ? true : retriable === "false" ? false : undefined,
    });
    fetchJson<PagedRowsResponse<FailureRow>>(
      `/api/v1/days/${day}/events/${selectedEvent}/failures${query}`,
      controller.signal
    )
      .then((data) => {
        setFailureRows(data.rows ?? []);
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setFailureError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setFailureLoading(false);
        }
      });
    return () => controller.abort();
  }, [tab, day, selectedEvent, failurePage, searchTerm, accountNumber, exceptionType, retriable]);

  const rows = tab === "success" ? successRows : failureRows;
  const rowsLoading = tab === "success" ? successLoading : failureLoading;
  const rowsError = tab === "success" ? successError : failureError;
  const page = tab === "success" ? successPage : failurePage;
  const setPage = tab === "success" ? setSuccessPage : setFailurePage;
  const canPrev = page > 0;
  const canNext = rows.length === pageSize;
  const rowOffset = page * pageSize;
  const bucketPoints = buckets?.buckets ?? [];
  const updatedText = summaryLoading
    ? "Loading..."
    : summary?.generatedAt
    ? `Updated ${formatTimeAgo(summary.generatedAt)}`
    : "Not loaded";

  const clearFilters = () => {
    setSearchTerm("");
    setAccountNumber("");
    setExceptionType("");
    setRetriable("all");
    setSuccessPage(0);
    setFailurePage(0);
  };

  const openRow = (row: SuccessRow | FailureRow) => {
    setSelectedRow(row);
    setDrawerOpen(true);
  };

  useEffect(() => {
    if (!drawerOpen || typeof document === "undefined") {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [drawerOpen]);

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <div className="breadcrumbs">
            Dashboard <span>/</span> Event Monitor <span>/</span> <strong>{meta.name}</strong>
          </div>
          <div className="title-row">
            <h1>{meta.name}</h1>
            <span className="badge">Live View</span>
          </div>
          <p className="subtitle">
            Last updated: <strong>{summary?.generatedAt ? formatDateTime(summary.generatedAt) : "--"}</strong>{" "}
            <span className="dot" /> {updatedText}
          </p>
        </div>
        <div className="control-row">
          <DateField day={day} onDayChange={onDayChange} onDayModeChange={onDayModeChange} />
          <div className="select">
            <span className="material-symbols-outlined">filter_list</span>
            <select value={selectedEvent} onChange={(event) => onSelectEvent(event.target.value)}>
              {eventOptions.map((eventKey) => {
                const optionMeta = getEventMeta(eventKey);
                return (
                  <option key={eventKey} value={eventKey}>
                    {optionMeta.name}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="select">
            <span className="material-symbols-outlined">schedule</span>
            <select value={bucketInterval} onChange={(event) => setBucketInterval(Number(event.target.value))}>
              <option value={60}>Last 24 hours (hourly)</option>
              <option value={15}>Last 24 hours (15 min)</option>
            </select>
          </div>
          <button className="button primary" onClick={() => setRefreshIndex((value) => value + 1)}>
            <span className="material-symbols-outlined">refresh</span>
            Refresh
          </button>
        </div>
      </div>

      {summaryError && <div className="banner error">Failed to load summary: {summaryError}</div>}

      <div className="kpi-grid">
        <KpiCard
          title="Total Events"
          value={summary ? formatNumber(summary.kpis.total) : "--"}
          icon="functions"
          tone="neutral"
        >
          <div className="kpi-trend success">
            <span className="material-symbols-outlined">trending_up</span>
            {summary ? `Success ${formatNumber(summary.kpis.success)}` : "Loading"}
          </div>
        </KpiCard>
        <KpiCard
          title="Success Rate"
          value={summary ? formatPercent(summary.kpis.successRate) : "--"}
          icon="check_circle"
          tone="success"
        >
          <div className="kpi-trend success">
            <span className="material-symbols-outlined">trending_up</span>
            {summary ? "Stable" : "Loading"}
          </div>
        </KpiCard>
        <KpiCard
          title="Failures"
          value={summary ? formatNumber(summary.kpis.failure) : "--"}
          icon="warning"
          tone="danger"
        >
          <div className="kpi-trend danger">
            <span className="material-symbols-outlined">priority_high</span>
            {summary ? `Retriable ${formatNumber(summary.kpis.retriableFailures)}` : "Loading"}
          </div>
        </KpiCard>
        <KpiCard
          title="Avg Processing"
          value={summary ? formatLatency(summary.kpis.avgLatencyMs) : "--"}
          icon="timer"
          tone="info"
        >
          <div className="kpi-trend latency">
            <span className="material-symbols-outlined">trending_flat</span>
            {summary ? "Latency trend" : "Loading"}
          </div>
        </KpiCard>
      </div>

      <HourlyTrendsPanel
        title="Hourly Trends"
        subtitle="Success, failure rates, and latency correlation"
        buckets={bucketPoints}
        loading={bucketsLoading}
        error={bucketsError}
      />

      <div className="grid-2 detail-layout">
        <div className="panel">
          <div className="tabs">
            <button className={tab === "success" ? "tab active" : "tab"} onClick={() => setTab("success")}>
              Success <span className="tab-count">{summary ? formatNumber(summary.kpis.success) : "--"}</span>
            </button>
            <button className={tab === "failures" ? "tab active" : "tab"} onClick={() => setTab("failures")}>
              Failures{" "}
              <span className="tab-count danger">{summary ? formatNumber(summary.kpis.failure) : "--"}</span>
            </button>
          </div>

          <div className="table-toolbar">
            <div className="search">
              <span className="material-symbols-outlined">search</span>
              <input
                placeholder="Search traceId or msg:messageKey"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="toolbar-actions">
              <div className="field">
                <label>Account</label>
                <input
                  placeholder="Account number"
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value)}
                />
              </div>
              {tab === "failures" && (
                <>
                  <div className="field">
                    <label>Exception</label>
                    <input
                      placeholder="Exception type"
                      value={exceptionType}
                      onChange={(event) => setExceptionType(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Retriable</label>
                    <select value={retriable} onChange={(event) => setRetriable(event.target.value as "all")}>
                      <option value="all">All</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                </>
              )}
              <button className="button ghost small" onClick={clearFilters}>
                Clear
              </button>
            </div>
          </div>

          {rowsError && <div className="banner error">Failed to load rows: {rowsError}</div>}
          {rowsLoading && <div className="banner info">Loading rows...</div>}

          <div className="table-wrap">
            {tab === "success" ? (
              <table className="table-wide">
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Trace ID</th>
                    <th>Account</th>
                    <th>Customer Type</th>
                    <th>Source Topic</th>
                    <th>Target Topic</th>
                    <th>Latency</th>
                    <th>Message Key</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-cell">
                        No success rows match the current filters.
                      </td>
                    </tr>
                  ) : (
                    successRows.map((row, index) => {
                      const latencyMs = calculateLatencyMs(row);
                      return (
                        <tr
                          key={row.id ?? row.event_trace_id ?? `success-${index}`}
                          className="clickable"
                          onClick={() => openRow(row)}
                        >
                          <td className="mono">{formatDateTime(row.event_received_timestamp)}</td>
                          <td className="mono">{toDisplayValue(row.event_trace_id)}</td>
                          <td className="mono">{toDisplayValue(row.account_number)}</td>
                          <td>{toDisplayValue(row.customer_type)}</td>
                          <td className="mono muted">{toDisplayValue(row.source_topic)}</td>
                          <td className="mono muted">{toDisplayValue(row.target_topic)}</td>
                          <td className="mono muted">{formatLatency(latencyMs ?? undefined)}</td>
                          <td className="mono">{toDisplayValue(row.message_key)}</td>
                          <td className="right">
                            <button
                              className="icon-button subtle"
                              onClick={(event) => {
                                event.stopPropagation();
                                openRow(row);
                              }}
                              aria-label="Open details"
                            >
                              <span className="material-symbols-outlined">chevron_right</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              <table className="table-wide">
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Trace ID</th>
                    <th>Account</th>
                    <th>Exception</th>
                    <th>Message</th>
                    <th>Retriable</th>
                    <th>Retry</th>
                    <th>Message Key</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-cell">
                        No failure rows match the current filters.
                      </td>
                    </tr>
                  ) : (
                    failureRows.map((row, index) => {
                      const retriableLabel = row.retriable ? "Yes" : "No";
                      return (
                        <tr
                          key={row.id ?? row.event_trace_id ?? `failure-${index}`}
                          className="clickable"
                          onClick={() => openRow(row)}
                        >
                          <td className="mono">{formatDateTime(row.event_received_timestamp)}</td>
                          <td className="mono">{toDisplayValue(row.event_trace_id)}</td>
                          <td className="mono">{toDisplayValue(row.account_number)}</td>
                          <td className="mono">{toDisplayValue(row.exception_type)}</td>
                          <td title={row.exception_message ?? ""}>
                            {row.exception_message ? row.exception_message.slice(0, 80) : "--"}
                            {row.exception_message && row.exception_message.length > 80 ? "..." : ""}
                          </td>
                          <td>
                            <span className={row.retriable ? "tag warning" : "tag neutral"}>{retriableLabel}</span>
                          </td>
                          <td className="mono muted">{toDisplayValue(row.retry_attempt)}</td>
                          <td className="mono">{toDisplayValue(row.message_key)}</td>
                          <td className="right">
                            <button
                              className="icon-button subtle"
                              onClick={(event) => {
                                event.stopPropagation();
                                openRow(row);
                              }}
                              aria-label="Open details"
                            >
                              <span className="material-symbols-outlined">chevron_right</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div className="table-footer">
            <span>
              {rows.length === 0
                ? "No results"
                : `Showing ${rowOffset + 1} to ${rowOffset + rows.length}`}
            </span>
            <div className="pager">
              <button disabled={!canPrev} onClick={() => setPage((value) => Math.max(0, value - 1))}>
                Previous
              </button>
              <button disabled={!canNext} onClick={() => setPage((value) => value + 1)}>
                Next
              </button>
            </div>
          </div>
        </div>

        {drawerOpen && selectedRow && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="transaction-details-title">
            <div className="modal-backdrop" onClick={() => setDrawerOpen(false)} />
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 id="transaction-details-title">Transaction Details</h3>
                  <div className="modal-meta">
                    <span className="mono">{toDisplayValue(selectedRow.event_trace_id)}</span>
                    <span className={tab === "failures" ? "tag danger" : "tag success"}>
                      {tab === "failures" ? "Failed" : "Success"}
                    </span>
                  </div>
                </div>
                <button className="icon-button" onClick={() => setDrawerOpen(false)} aria-label="Close dialog">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="section">
                  <h4>Metadata</h4>
                  <div className="meta-grid">
                    {[
                      { label: "Trace ID", value: selectedRow.event_trace_id, mono: true },
                      { label: "Account", value: selectedRow.account_number, mono: true },
                      { label: "Customer Type", value: selectedRow.customer_type },
                      { label: "Received", value: formatDateTime(selectedRow.event_received_timestamp) },
                      { label: "Sent", value: formatDateTime(selectedRow.event_sent_timestamp) },
                      { label: "Latency", value: formatLatency(calculateLatencyMs(selectedRow) ?? undefined) },
                      { label: "Source Topic", value: selectedRow.source_topic },
                      { label: "Source Partition", value: selectedRow.source_partition_id },
                      { label: "Source Offset", value: selectedRow.source_offset },
                      { label: "Target Topic", value: selectedRow.target_topic },
                      { label: "Target Partition", value: selectedRow.target_partition_id },
                      { label: "Target Offset", value: selectedRow.target_offset },
                      { label: "Message Key", value: selectedRow.message_key, mono: true },
                    ].map((item) => (
                      <div key={item.label} className="meta-card">
                        <span>{item.label}</span>
                        <strong className={item.mono ? "mono" : undefined}>{toDisplayValue(item.value)}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {"exception_type" in selectedRow && (
                  <div className="section error-box">
                    <h4>
                      <span className="material-symbols-outlined">error</span>
                      Exception
                    </h4>
                    <div className="exception-title">{toDisplayValue(selectedRow.exception_type)}</div>
                    {selectedRow.exception_message && <p>{selectedRow.exception_message}</p>}
                    {selectedRow.exception_stack && (
                      <pre className="code-block">{formatPayload(selectedRow.exception_stack)}</pre>
                    )}
                  </div>
                )}

                <div className="section">
                  <h4>Payloads</h4>
                  <div className="payload-grid">
                    <PayloadBlock title="Source Payload" value={selectedRow.source_payload} />
                    <PayloadBlock title="Transformed Payload" value={selectedRow.transformed_payload} />
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="button ghost" onClick={() => setDrawerOpen(false)}>
                  Investigate
                </button>
                <button className="button primary" onClick={() => setDrawerOpen(false)}>
                  <span className="material-symbols-outlined">replay</span>
                  Replay Event
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DateField({
  day,
  onDayChange,
  onDayModeChange,
}: {
  day: string;
  onDayChange: (value: string) => void;
  onDayModeChange: (value: DayMode) => void;
}) {
  return (
    <label className="date-field">
      <span className="material-symbols-outlined">calendar_today</span>
      <input
        type="date"
        value={day}
        onChange={(event) => {
          onDayModeChange("custom");
          onDayChange(event.target.value);
        }}
      />
    </label>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  tone = "neutral",
  children,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
  children?: ReactNode;
}) {
  return (
    <div className={`kpi-card ${tone}`}>
      <div className="kpi-head">
        <span>{title}</span>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div className="kpi-value mono">{value}</div>
      {subtitle && <div className="kpi-sub">{subtitle}</div>}
      {children}
    </div>
  );
}

const sampleBuckets = (buckets: BucketPoint[], count: number) => {
  if (buckets.length <= count) {
    return buckets;
  }
  const lastIndex = buckets.length - 1;
  return Array.from({ length: count }, (_, index) => {
    const position = Math.round((lastIndex * index) / (count - 1));
    return buckets[position];
  });
};

function MiniVolumePanel({
  title,
  value,
  tone,
  bars,
}: {
  title: string;
  value: string;
  tone: "success" | "failure";
  bars: number[];
}) {
  return (
    <div className={`mini-panel ${tone}`}>
      <div className="mini-header">
        <span>{title}</span>
        <span className="mini-value mono">{value}</span>
      </div>
      <div className="mini-bars">
        {bars.map((height, index) => (
          <span key={`${title}-${index}`} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

function HourlyTrendsPanel({
  title,
  subtitle,
  buckets,
  loading,
  error,
}: {
  title: string;
  subtitle: string;
  buckets: BucketPoint[];
  loading?: boolean;
  error?: string | null;
}) {
  const hasData = buckets.length > 0;
  const axisLabels = useMemo(() => getAxisLabels(buckets, 7).map((label) => label), [buckets]);
  const latencyValues = useMemo(() => buckets.map((bucket) => bucket.avgLatencyMs ?? 0), [buckets]);
  const latencyMax = useMemo(() => Math.max(500, ...latencyValues, 1), [latencyValues]);
  const points = useMemo(() => {
    const count = buckets.length;
    return buckets.map((bucket, index) => {
      const x = count <= 1 ? 0 : (index / (count - 1)) * 100;
      const total = bucket.total || 0;
      const successRate = total ? (bucket.success / total) * 100 : 0;
      const failureRate = total ? (bucket.failure / total) * 100 : 0;
      const latencyValue = bucket.avgLatencyMs ?? 0;
      return {
        x,
        successRate,
        failureRate,
        latencyValue,
        successY: 100 - successRate,
        failureY: 100 - failureRate,
        latencyY: 100 - (clamp(latencyValue, 0, latencyMax) / latencyMax) * 100,
      };
    });
  }, [buckets, latencyMax]);
  const successPath = buildLinePath(points.map((point) => ({ x: point.x, y: point.successY })));
  const failurePath = buildLinePath(points.map((point) => ({ x: point.x, y: point.failureY })));
  const latencyPath = buildLinePath(points.map((point) => ({ x: point.x, y: point.latencyY })));
  const latencyAreaPath = buildAreaPath(points.map((point) => ({ x: point.x, y: point.latencyY })));

  const focusIndex = useMemo(() => {
    if (!points.length) {
      return -1;
    }
    return points.reduce((maxIndex, point, index) => {
      return point.failureRate > points[maxIndex].failureRate ? index : maxIndex;
    }, 0);
  }, [points]);
  const focusPoint = focusIndex >= 0 ? points[focusIndex] : null;
  const focusBucket = focusIndex >= 0 ? buckets[focusIndex] : null;
  const focusX = focusPoint ? focusPoint.x : 0;
  const tooltipLeft = clamp(focusX, 10, 90);

  const successBars = useMemo(() => {
    const sample = sampleBuckets(buckets, 15);
    const maxValue = Math.max(1, ...sample.map((bucket) => bucket.success));
    return sample.map((bucket) => Math.round((bucket.success / maxValue) * 100));
  }, [buckets]);
  const failureBars = useMemo(() => {
    const sample = sampleBuckets(buckets, 15);
    const maxValue = Math.max(1, ...sample.map((bucket) => bucket.failure));
    return sample.map((bucket) => Math.round((bucket.failure / maxValue) * 100));
  }, [buckets]);
  const totalSuccess = buckets.reduce((sum, bucket) => sum + bucket.success, 0);
  const totalFailure = buckets.reduce((sum, bucket) => sum + bucket.failure, 0);
  const latencyTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => Math.round(latencyMax * ratio));

  return (
    <div className="trend-panel">
      <div className="trend-header">
        <div>
          <div className="trend-title">
            <h3>{title}</h3>
            <span className="trend-live">
              <span className="live-dot" />
              Live
            </span>
          </div>
          <p>{subtitle}</p>
        </div>
        <div className="trend-controls">
          <div className="trend-legend">
            <span className="legend success">
              <i />
              Success
            </span>
            <span className="legend failure">
              <i />
              Failure
            </span>
            <span className="legend latency">
              <i />
              Latency
            </span>
          </div>
          <div className="trend-range">
            <button type="button">1H</button>
            <button type="button">6H</button>
            <button type="button">12H</button>
            <button className="active" type="button">
              24H
            </button>
          </div>
        </div>
      </div>

      {error && <div className="banner error">Failed to load buckets: {error}</div>}
      {loading && !hasData ? (
        <div className="empty-state">Loading hourly trends...</div>
      ) : !hasData ? (
        <div className="empty-state">No bucket data available for this day.</div>
      ) : (
        <>
          <div className="trend-body">
            <div className="trend-chart">
              <div className="trend-grid">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="trend-axis left">
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>
              <div className="trend-axis right">
                {latencyTicks.map((tick, index) => (
                  <span key={`lat-${index}`}>{tick}ms</span>
                ))}
              </div>
              <div className="trend-lines">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path className="line success" d={successPath} />
                </svg>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path className="line failure" d={failurePath} />
                </svg>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="latencyFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-latency)" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="var(--color-latency)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="line latency-fill" d={latencyAreaPath} fill="url(#latencyFill)" />
                  <path className="line latency" d={latencyPath} />
                </svg>
              </div>
              {focusPoint && <div className="trend-marker" style={{ left: `${focusX}%` }} />}
              {focusPoint && focusBucket && (
                <div className="trend-tooltip" style={{ left: `${tooltipLeft}%` }}>
                  <div className="trend-tooltip-header">
                    <span className="mono">{formatTooltipTime(focusBucket.bucketStart)}</span>
                    {focusPoint.failureRate > 5 && <span className="trend-flag">Issue</span>}
                  </div>
                  <div className="trend-tooltip-grid">
                    <span className="dot success" />
                    <span>Success</span>
                    <span className="mono">{formatPercent(focusPoint.successRate)}</span>
                    <span className="dot failure" />
                    <span>Failure</span>
                    <span className="mono">{formatPercent(focusPoint.failureRate)}</span>
                    <span className="dot latency" />
                    <span>Latency</span>
                    <span className="mono">{formatLatency(focusPoint.latencyValue)}</span>
                  </div>
                  <div className="trend-tooltip-arrow" />
                </div>
              )}
            </div>
            <div className="trend-axis-bottom">
              {axisLabels.map((label, index) => (
                <span
                  key={`axis-${label}-${index}`}
                  className={index === Math.floor(axisLabels.length / 2) ? "active" : undefined}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="mini-grid">
            <MiniVolumePanel
              title="Success Volume"
              value={formatNumber(totalSuccess)}
              tone="success"
              bars={successBars}
            />
            <MiniVolumePanel
              title="Failure Volume"
              value={formatNumber(totalFailure)}
              tone="failure"
              bars={failureBars}
            />
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ tone }: { tone: StatusTone }) {
  return <span className={`status-badge ${tone}`}>{statusLabels[tone]}</span>;
}

function PayloadBlock({ title, value }: { title: string; value?: string }) {
  const payload = formatPayload(value);
  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard && payload.length > 0;

  const handleCopy = async () => {
    if (!canCopy) {
      return;
    }
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="payload-block">
      <div className="section-header">
        <h4>{title}</h4>
        <button className="link-button" onClick={handleCopy} disabled={!canCopy}>
          <span className="material-symbols-outlined">content_copy</span>
          Copy JSON
        </button>
      </div>
      {payload ? <pre className="code-block">{payload}</pre> : <div className="empty-state">No payload available.</div>}
    </div>
  );
}
