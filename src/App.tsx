import {
  type ReactNode,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  p95LatencyMs: number;
};

type EventBreakdownRow = {
  eventKey: string;
  eventName: string;
  category: string;
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
  failureSources?: string[];
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
  total: number;
  rows: T[];
};

type EventCatalogItem = {
  eventKey: string;
  name: string;
  category: string;
};

type EventRow = EventBreakdownRow & {
  name: string;
  category: string;
  status: StatusTone;
};
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

const toCsvValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
};

const buildEventsCsv = (day: string, rows: EventRow[]) => {
  const header = [
    "Day",
    "Event Key",
    "Event Name",
    "Category",
    "Total",
    "Success",
    "Failures",
    "Retriable",
    "Success Rate",
    "Avg Latency Ms",
    "Status",
  ];
  const lines = rows.map((row) => [
    day,
    row.eventKey,
    row.name,
    row.category,
    row.total,
    row.success,
    row.failure,
    row.retriableFailures,
    row.successRate,
    row.avgLatencyMs,
    statusLabels[row.status] ?? row.status,
  ]);
  return [header, ...lines].map((line) => line.map(toCsvValue).join(",")).join("\n");
};

const downloadCsv = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const sortBucketsByTime = (buckets: BucketPoint[]) => {
  if (buckets.length <= 1) {
    return buckets;
  }
  return [...buckets].sort((left, right) => {
    const leftTime = parseDate(left.bucketStart)?.getTime() ?? 0;
    const rightTime = parseDate(right.bucketStart)?.getTime() ?? 0;
    return leftTime - rightTime;
  });
};

const buildDeltaLabel = (
  buckets: BucketPoint[],
  getValue: (bucket: BucketPoint) => number,
  formatter: (value: number) => string
) => {
  const sorted = sortBucketsByTime(buckets);
  if (sorted.length < 2) {
    return "No recent change";
  }
  const current = getValue(sorted[sorted.length - 1]);
  const previous = getValue(sorted[sorted.length - 2]);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return "No recent change";
  }
  const delta = current - previous;
  if (Math.abs(delta) < 0.0001) {
    return "No recent change";
  }
  const sign = delta > 0 ? "+" : "-";
  return `${sign}${formatter(Math.abs(delta))} vs prev hour`;
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

const splitDateTimeInput = (value: string) => {
  if (!value) {
    return { date: "", time: "" };
  }
  const [date, time = ""] = value.split("T");
  return { date, time };
};

const resolveSearch = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { traceId: undefined, messageKey: undefined };
  }
  return { traceId: trimmed, messageKey: undefined };
};

const resolveCatalogEntry = (eventKey: string, catalog: EventCatalogItem[]) => {
  const entry = catalog.find((item) => item.eventKey === eventKey);
  if (entry) {
    return entry;
  }
  return {
    eventKey,
    name: eventKey || "Event Details",
    category: "Uncategorized",
  };
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

const getAxisLabels = (
  buckets: BucketPoint[],
  labelCount = 7,
  intervalMinutes?: number,
  useBucketEnd?: boolean
) => {
  if (!buckets.length) {
    return [];
  }
  const safeCount = Math.max(2, Math.min(labelCount, buckets.length));
  const lastIndex = buckets.length - 1;
  if (buckets.length <= safeCount) {
    return buckets.map((bucket) => {
    const labelDate = parseDate(bucket.bucketStart);
    if (!labelDate) {
      return "--:--";
    }
    const resolved = useBucketEnd && intervalMinutes
      ? new Date(labelDate.getTime() + intervalMinutes * 60 * 1000)
      : labelDate;
    const hours = String(resolved.getHours()).padStart(2, "0");
    const minutes = String(resolved.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  });
  }
  const positionSet = new Set<number>();
  for (let index = 0; index < safeCount; index += 1) {
    positionSet.add(Math.round((lastIndex * index) / (safeCount - 1)));
  }
  return Array.from(positionSet)
    .sort((left, right) => left - right)
    .map((index) => {
      const labelDate = parseDate(buckets[index]?.bucketStart);
      if (!labelDate) {
        return "--:--";
      }
      const resolved = useBucketEnd && intervalMinutes
        ? new Date(labelDate.getTime() + intervalMinutes * 60 * 1000)
        : labelDate;
      const hours = String(resolved.getHours()).padStart(2, "0");
      const minutes = String(resolved.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    });
};

const formatAxisTime = (value?: unknown) => {
  const date = parseDate(value);
  if (!date) {
    return "--:--";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const smoothSeries = (values: number[], windowSize = 3) => {
  if (values.length <= 2 || windowSize <= 1) {
    return values;
  }
  const radius = Math.floor(windowSize / 2);
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    let sum = 0;
    let count = 0;
    for (let i = start; i <= end; i += 1) {
      sum += values[i];
      count += 1;
    }
    return count > 0 ? sum / count : values[index];
  });
};

const getNiceMax = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / magnitude;
  const rounded =
    scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return rounded * magnitude;
};

const buildLinePath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) {
    return "";
  }
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
};

const buildLinePathWithGaps = (
  points: Array<{ x: number; y: number }>,
  visible: boolean[]
) => {
  let path = "";
  let started = false;
  points.forEach((point, index) => {
    if (!visible[index]) {
      started = false;
      return;
    }
    path += `${started ? "L" : "M"}${point.x} ${point.y} `;
    started = true;
  });
  return path.trim();
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

const formatTooltipRange = (start?: unknown, intervalMinutes?: number) => {
  const startDate = parseDate(start);
  if (!startDate) {
    return "--:--";
  }
  if (!intervalMinutes || intervalMinutes <= 0) {
    return formatTooltipTime(startDate);
  }
  const endDate = new Date(startDate.getTime() + intervalMinutes * 60 * 1000);
  return `${formatTooltipTime(startDate)} - ${formatTooltipTime(endDate)}`;
};

const formatSourceList = (sources: string[], max = 2) => {
  if (!sources.length) {
    return "--";
  }
  const unique = Array.from(new Set(sources));
  if (unique.length <= max) {
    return unique.join(", ");
  }
  return `${unique.slice(0, max).join(", ")} +${unique.length - max}`;
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
  const [activeNav, setActiveNav] = useState("home");
  const [eventHeaderControls, setEventHeaderControls] = useState<React.ReactNode>(null);
  const [dayMode, setDayMode] = useState<DayMode>("today");
  const [day, setDay] = useState(() => toLocalDayString(new Date()));
  const [eventCatalog, setEventCatalog] = useState<EventCatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const activeMeta = resolveCatalogEntry(selectedEvent, eventCatalog);
  const headerTitle = screen === "home" ? "Global Event Aggregation" : activeMeta.name;
  const headerSub = screen === "home" ? "" : "Events Log";
  const navItems = [
    { id: "home", label: "Global Aggregation", icon: "dashboard", screen: "home" as ScreenMode },
    { id: "event", label: "Events Log", icon: "list", screen: "event" as ScreenMode },
    { id: "failures", label: "Failure Analysis", icon: "bug_report", screen: "event" as ScreenMode },
  ];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogError(null);
    fetchJson<EventCatalogItem[]>("/api/v1/events", controller.signal)
      .then((data) => {
        setEventCatalog(data ?? []);
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setCatalogError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedEvent && eventCatalog.length > 0) {
      setSelectedEvent(eventCatalog[0].eventKey);
    }
  }, [selectedEvent, eventCatalog]);

  useEffect(() => {
    if (dayMode === "today") {
      setDay(toLocalDayString(new Date()));
    } else if (dayMode === "yesterday") {
      setDay(toLocalDayString(new Date(Date.now() - 24 * 60 * 60 * 1000)));
    }
  }, [dayMode]);

  const homeHeaderControls =
    screen === "home" ? (
      <div className="control-row header-control-row">
        <div className="day-toggle">
          <span className="day-label">Day:</span>
          <div className="segmented">
            <button
              className={dayMode === "today" ? "segment active" : "segment"}
              onClick={() => setDayMode("today")}
              type="button"
            >
              Today
            </button>
            <button
              className={dayMode === "yesterday" ? "segment active" : "segment"}
              onClick={() => setDayMode("yesterday")}
              type="button"
            >
              Yesterday
            </button>
          </div>
          <DateField day={day} onDayChange={setDay} onDayModeChange={setDayMode} />
        </div>
      </div>
    ) : null;

  const headerControlsNode = screen === "event" ? eventHeaderControls : homeHeaderControls;

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
            const isActive = item.id === activeNav;
            return (
              <button
                key={item.id}
                className={isActive ? "sidebar-link active" : "sidebar-link"}
                onClick={() => {
                  if (item.screen) {
                    setScreen(item.screen);
                    setActiveNav(item.id);
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
        <header className={screen === "event" ? "top-header event-header" : "top-header"}>
          <div className="header-left">
            <div className="header-title">
              {screen === "event" ? (
                <div className="header-breadcrumbs">
                  <button
                    className="header-link"
                    type="button"
                    onClick={() => {
                      setScreen("home");
                      setActiveNav("home");
                    }}
                  >
                    Dashboard
                  </button>
                  <span>/</span>
                  <span>{headerTitle}</span>
                </div>
              ) : (
                <h1>{headerTitle}</h1>
              )}
              {screen === "event" && <span className="badge header-badge">Live View</span>}
            </div>
            {screen !== "event" && headerSub && (
              <>
                <span className="header-sep">/</span>
                <span className="header-sub">{headerSub}</span>
              </>
            )}
          </div>
          {headerControlsNode ? <div className="header-controls">{headerControlsNode}</div> : null}
          <div className="header-actions">
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
          {catalogError && <div className="banner error">Failed to load event list: {catalogError}</div>}
          {screen === "home" ? (
            <HomeScreen
              day={day}
              onOpenEvent={(eventKey) => {
                setSelectedEvent(eventKey);
                setScreen("event");
                setActiveNav("event");
              }}
            />
          ) : (
            <EventDetailsScreen
              day={day}
              dayMode={dayMode}
              onDayModeChange={setDayMode}
              onDayChange={setDay}
              onNavigateHome={() => {
                setScreen("home");
                setActiveNav("home");
              }}
              selectedEvent={selectedEvent}
              onSelectEvent={setSelectedEvent}
              eventCatalog={eventCatalog}
              onHeaderControls={setEventHeaderControls}
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
    const eventNameMap = new Map(home.events.map((event) => [event.eventKey, event.eventName]));
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
          const failureSources: string[] = [];
          responses.forEach((response, responseIndex) => {
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
            if (bucket.failure > 0) {
              const key = eventKeys[responseIndex];
              failureSources.push(eventNameMap.get(key) || key || "Unknown");
            }
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
            failureSources: failureSources.length ? failureSources : undefined,
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
      const name = event.eventName?.trim() ? event.eventName : event.eventKey;
      const category = event.category?.trim() ? event.category : "Uncategorized";
      return {
        ...event,
        name,
        category,
        status: getStatusTone(event.successRate),
      };
    });
  }, [home]);
  const canExport = eventRows.length > 0;
  const handleExport = useCallback(() => {
    if (!eventRows.length) {
      return;
    }
    const csv = buildEventsCsv(day, eventRows);
    downloadCsv(`all-events-${day}.csv`, csv);
  }, [day, eventRows]);

  const chartBuckets = homeBuckets ?? [];

  return (
    <section className="home">
      {homeError && <div className="banner error">Failed to load home data: {homeError}</div>}

      <div className="kpi-grid">
        <KpiCard title="Total Events" value={home ? formatNumber(home.kpis.total) : "--"} icon="functions" tone="neutral" />
        <KpiCard title="Success" value={home ? formatNumber(home.kpis.success) : "--"} icon="check_circle" tone="success" />
        <KpiCard title="Failures" value={home ? formatNumber(home.kpis.failure) : "--"} icon="warning" tone="danger" />
        <KpiCard
          title="Success Rate"
          value={home ? formatPercent(home.kpis.successRate) : "--"}
          icon="percent"
          tone="success"
        />
        <KpiCard
          title="Retriable Failures"
          value={home ? formatNumber(home.kpis.retriableFailures) : "--"}
          icon="history"
          tone="warning"
        />
        <KpiCard
          title="Avg Latency"
          value={home ? formatLatency(home.kpis.avgLatencyMs) : "--"}
          icon="timer"
          tone="info"
          subtitle="Success only"
        />
        <KpiCard
          title="P95 Latency"
          value={home ? formatLatency(home.kpis.p95LatencyMs) : "--"}
          icon="insights"
          tone="info"
          subtitle="Success only"
        />
      </div>

      <HourlyTrendsPanel
        title="Hourly Trends"
        subtitle="Monitoring success, failure rates, and latency correlation"
        buckets={chartBuckets}
        loading={homeBucketsLoading || homeLoading}
        error={homeBucketsError}
        intervalMinutes={60}
      />

      <div className="card table-card">
        <div className="card-header">
          <h3>All Events Breakdown</h3>
          <button
            className="link-button"
            type="button"
            onClick={handleExport}
            disabled={!canExport}
            title={canExport ? "Export CSV" : "No data to export"}
          >
            Export
            <span className="material-symbols-outlined">download</span>
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Total</th>
                <th>Success</th>
                <th>Failures</th>
                <th>Retriable</th>
                <th>Success Rate</th>
                <th>Avg Latency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {eventRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-cell">
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
                    <td className="mono">{formatNumber(event.success)}</td>
                    <td className={event.failure > 0 ? "mono danger" : "mono"}>
                      {formatNumber(event.failure)}
                    </td>
                    <td className="mono">{formatNumber(event.retriableFailures)}</td>
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
    </section>
  );
}

type EventDetailsScreenProps = {
  day: string;
  dayMode: DayMode;
  onDayModeChange: (value: DayMode) => void;
  onDayChange: (value: string) => void;
  onNavigateHome: () => void;
  selectedEvent: string;
  onSelectEvent: (value: string) => void;
  eventCatalog: EventCatalogItem[];
  onHeaderControls?: (node: React.ReactNode) => void;
};

function EventDetailsScreen({
  day,
  dayMode,
  onDayModeChange,
  onDayChange,
  onNavigateHome,
  selectedEvent,
  onSelectEvent,
  eventCatalog,
  onHeaderControls,
}: EventDetailsScreenProps) {
  const [summary, setSummary] = useState<EventSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<EventBucketsResponse | null>(null);
  const [bucketsLoading, setBucketsLoading] = useState(false);
  const [bucketsError, setBucketsError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const bucketInterval = 60;
  const [tab, setTab] = useState<"success" | "failures">("failures");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState<
    "trace" | "account" | "exception" | "retriable"
  >("trace");
  const [searchValue, setSearchValue] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [fromDateTime, setFromDateTime] = useState("");
  const [toDateTime, setToDateTime] = useState("");
  const [fromDateTimeInput, setFromDateTimeInput] = useState("");
  const [toDateTimeInput, setToDateTimeInput] = useState("");
  const [exceptionType, setExceptionType] = useState("");
  const [exceptionOptions, setExceptionOptions] = useState<string[]>([]);
  const [exceptionOptionsLoading, setExceptionOptionsLoading] = useState(false);
  const [exceptionOptionsError, setExceptionOptionsError] = useState<string | null>(null);
  const [retriable, setRetriable] = useState<"all" | "true" | "false">("all");
  const [retriableInput, setRetriableInput] = useState<"all" | "true" | "false">("all");
  const [successPage, setSuccessPage] = useState(0);
  const [failurePage, setFailurePage] = useState(0);
  const [successRows, setSuccessRows] = useState<SuccessRow[]>([]);
  const [failureRows, setFailureRows] = useState<FailureRow[]>([]);
  const [successLoading, setSuccessLoading] = useState(false);
  const [failureLoading, setFailureLoading] = useState(false);
  const [successError, setSuccessError] = useState<string | null>(null);
  const [failureError, setFailureError] = useState<string | null>(null);
  const [successTotal, setSuccessTotal] = useState(0);
  const [failureTotal, setFailureTotal] = useState(0);
  const [successPageInput, setSuccessPageInput] = useState("1");
  const [failurePageInput, setFailurePageInput] = useState("1");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<SuccessRow | FailureRow | null>(null);
  const pageSize = 50;
  const meta = resolveCatalogEntry(selectedEvent, eventCatalog);
  const eventCatalogMap = useMemo(
    () => new Map(eventCatalog.map((item) => [item.eventKey, item])),
    [eventCatalog]
  );
  const eventOptions = useMemo(() => {
    const set = new Set(eventCatalog.map((item) => item.eventKey));
    if (selectedEvent) {
      set.add(selectedEvent);
    }
    return Array.from(set);
  }, [eventCatalog, selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) {
      setSummary(null);
      return;
    }
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
    if (!selectedEvent) {
      setBuckets(null);
      return;
    }
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
    if (searchField !== "exception" || !selectedEvent) {
      return;
    }
    const controller = new AbortController();
    setExceptionOptionsLoading(true);
    setExceptionOptionsError(null);
    const { date: fromDate, time: fromTime } = splitDateTimeInput(fromDateTime);
    const { date: toDate, time: toTime } = splitDateTimeInput(toDateTime);
    const query = buildQuery({
      fromDate,
      toDate,
      fromTime,
      toTime,
    });
    fetchJson<string[]>(
      `/api/v1/days/${day}/events/${selectedEvent}/exception-types${query}`,
      controller.signal
    )
      .then((data) => {
        setExceptionOptions((data ?? []).filter(Boolean));
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setExceptionOptionsError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setExceptionOptionsLoading(false);
        }
      });
    return () => controller.abort();
  }, [day, fromDateTime, toDateTime, searchField, selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }
    setTab("failures");
    setSearchTerm("");
    setSearchField("trace");
    setSearchValue("");
    setAccountNumber("");
    setExceptionType("");
    setRetriable("all");
    setRetriableInput("all");
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
    if (searchField === "exception" || searchField === "retriable") {
      setSearchField("trace");
      setSearchValue(searchTerm);
      setRetriableInput("all");
    }
  }, [searchField, searchTerm, tab]);

  useEffect(() => {
    if (tab !== "success" || !selectedEvent) {
      return;
    }
    const controller = new AbortController();
    setSuccessLoading(true);
    setSuccessError(null);
    setSuccessTotal(0);
    const { traceId, messageKey } = resolveSearch(searchTerm);
    const { date: fromDate, time: fromTime } = splitDateTimeInput(fromDateTime);
    const { date: toDate, time: toTime } = splitDateTimeInput(toDateTime);
    const query = buildQuery({
      page: successPage,
      size: pageSize,
      traceId,
      messageKey,
      accountNumber: accountNumber.trim(),
      fromDate,
      toDate,
      fromTime,
      toTime,
    });
    fetchJson<PagedRowsResponse<SuccessRow>>(
      `/api/v1/days/${day}/events/${selectedEvent}/success${query}`,
      controller.signal
    )
      .then((data) => {
        setSuccessRows(data.rows ?? []);
        setSuccessTotal(Number.isFinite(data.total) ? data.total : 0);
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
  }, [tab, day, selectedEvent, successPage, searchTerm, accountNumber, fromDateTime, toDateTime]);

  useEffect(() => {
    if (tab !== "failures" || !selectedEvent) {
      return;
    }
    const controller = new AbortController();
    setFailureLoading(true);
    setFailureError(null);
    setFailureTotal(0);
    const { traceId, messageKey } = resolveSearch(searchTerm);
    const { date: fromDate, time: fromTime } = splitDateTimeInput(fromDateTime);
    const { date: toDate, time: toTime } = splitDateTimeInput(toDateTime);
    const query = buildQuery({
      page: failurePage,
      size: pageSize,
      traceId,
      messageKey,
      accountNumber: accountNumber.trim(),
      exceptionType: exceptionType.trim(),
      retriable:
        retriable === "all" ? undefined : retriable === "true" ? true : retriable === "false" ? false : undefined,
      fromDate,
      toDate,
      fromTime,
      toTime,
    });
    fetchJson<PagedRowsResponse<FailureRow>>(
      `/api/v1/days/${day}/events/${selectedEvent}/failures${query}`,
      controller.signal
    )
      .then((data) => {
        setFailureRows(data.rows ?? []);
        setFailureTotal(Number.isFinite(data.total) ? data.total : 0);
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
  }, [
    tab,
    day,
    selectedEvent,
    failurePage,
    searchTerm,
    accountNumber,
    exceptionType,
    retriable,
    fromDateTime,
    toDateTime,
  ]);

  const rows = tab === "success" ? successRows : failureRows;
  const rowsLoading = tab === "success" ? successLoading : failureLoading;
  const rowsError = tab === "success" ? successError : failureError;
  const page = tab === "success" ? successPage : failurePage;
  const setPage = tab === "success" ? setSuccessPage : setFailurePage;
  const total = tab === "success" ? successTotal : failureTotal;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;
  const rowOffset = page * pageSize;
  const pageInput = tab === "success" ? successPageInput : failurePageInput;
  const setPageInput = tab === "success" ? setSuccessPageInput : setFailurePageInput;
  const bucketPoints = buckets?.buckets ?? [];
  const successRateTrend = useMemo(
    () => buildDeltaLabel(bucketPoints, (bucket) => bucket.successRate, formatPercent),
    [bucketPoints]
  );
  const latencyTrend = useMemo(
    () => buildDeltaLabel(bucketPoints, (bucket) => bucket.avgLatencyMs, formatLatency),
    [bucketPoints]
  );
  const updatedText = summaryLoading
    ? "Loading..."
    : summary?.generatedAt
    ? `Updated ${formatTimeAgo(summary.generatedAt)}`
    : "Not loaded";
  const searchValuePlaceholder =
    searchField === "exception"
      ? "Exception type"
      : searchField === "account"
      ? "Account number"
      : "Enter value";
  const exceptionSelectLabel = exceptionOptionsLoading
    ? "Loading..."
    : exceptionOptionsError
    ? "Failed to load"
    : "All exceptions";

  const applyFilters = () => {
    const trimmedSearch = searchValue.trim();
    setSearchTerm("");
    setAccountNumber("");
    setExceptionType("");
    setRetriable("all");
    if (searchField === "trace") {
      setSearchTerm(trimmedSearch);
    } else if (searchField === "account") {
      setAccountNumber(trimmedSearch);
    } else if (searchField === "exception") {
      setExceptionType(trimmedSearch);
    } else if (searchField === "retriable") {
      setRetriable(retriableInput === "all" ? "true" : retriableInput);
    }
    setFromDateTime(fromDateTimeInput);
    setToDateTime(toDateTimeInput);
    setSuccessPage(0);
    setFailurePage(0);
  };

  const clearFilters = () => {
    setSearchField("trace");
    setSearchValue("");
    setSearchTerm("");
    setAccountNumber("");
    setExceptionType("");
    setRetriable("all");
    setRetriableInput("all");
    setFromDateTime("");
    setToDateTime("");
    setFromDateTimeInput("");
    setToDateTimeInput("");
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

  useEffect(() => {
    setSuccessPageInput(String(successPage + 1));
  }, [successPage]);

  useEffect(() => {
    setFailurePageInput(String(failurePage + 1));
  }, [failurePage]);

  const handleRefresh = useCallback(() => setRefreshIndex((value) => value + 1), []);

  const headerControls = useMemo(
    () => (
      <div className="control-row header-control-row">
        <div className="day-toggle">
          <span className="day-label">Day:</span>
          <div className="segmented">
            <button
              className={dayMode === "today" ? "segment active" : "segment"}
              onClick={() => onDayModeChange("today")}
              type="button"
            >
              Today
            </button>
            <button
              className={dayMode === "yesterday" ? "segment active" : "segment"}
              onClick={() => onDayModeChange("yesterday")}
              type="button"
            >
              Yesterday
            </button>
          </div>
          <DateField day={day} onDayChange={onDayChange} onDayModeChange={onDayModeChange} />
        </div>
        <div className="select">
          <span className="material-symbols-outlined">filter_list</span>
          <select value={selectedEvent} onChange={(event) => onSelectEvent(event.target.value)}>
            {eventOptions.map((eventKey) => {
              const optionMeta = eventCatalogMap.get(eventKey);
              const label = optionMeta?.name?.trim() ? optionMeta.name : eventKey;
              return (
                <option key={eventKey} value={eventKey}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
        <div className="refresh-stack">
          <button className="button primary" onClick={handleRefresh}>
            <span className="material-symbols-outlined">refresh</span>
            Refresh
          </button>
          <span className="updated-inline">{updatedText}</span>
        </div>
      </div>
    ),
    [day, dayMode, eventCatalogMap, eventOptions, handleRefresh, onDayChange, onDayModeChange, onSelectEvent, selectedEvent, updatedText]
  );

  useEffect(() => {
    if (!onHeaderControls) {
      return;
    }
    onHeaderControls(headerControls);
    return () => onHeaderControls(null);
  }, [headerControls, onHeaderControls]);

  return (
    <section className="page page-compact">
      {!onHeaderControls && <div className="page-header compact-controls">{headerControls}</div>}

      {summaryError && <div className="banner error">Failed to load summary: {summaryError}</div>}

      <div className="kpi-grid">
        <KpiCard title="Total Events" value={summary ? formatNumber(summary.kpis.total) : "--"} icon="functions" tone="neutral" />
        <KpiCard title="Success" value={summary ? formatNumber(summary.kpis.success) : "--"} icon="check_circle" tone="success" />
        <KpiCard title="Failures" value={summary ? formatNumber(summary.kpis.failure) : "--"} icon="warning" tone="danger" />
        <KpiCard
          title="Success Rate"
          value={summary ? formatPercent(summary.kpis.successRate) : "--"}
          icon="percent"
          tone="success"
        />
        <KpiCard
          title="Retriable Failures"
          value={summary ? formatNumber(summary.kpis.retriableFailures) : "--"}
          icon="history"
          tone="warning"
        />
        <KpiCard
          title="Avg Latency"
          value={summary ? formatLatency(summary.kpis.avgLatencyMs) : "--"}
          icon="timer"
          tone="info"
          subtitle="Success only"
        />
        <KpiCard
          title="P95 Latency"
          value={summary ? formatLatency(summary.kpis.p95LatencyMs) : "--"}
          icon="insights"
          tone="info"
          subtitle="Success only"
        />
      </div>

      <HourlyTrendsPanel
        title="Hourly Trends"
        subtitle="Success, failure rates, and latency correlation"
        buckets={bucketPoints}
        loading={bucketsLoading}
        error={bucketsError}
        intervalMinutes={buckets?.intervalMinutes ?? bucketInterval}
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

          <div className="filter-panel">
            <div className="filter-grid">
              <div className="field">
                <label>Search by</label>
                <div className="select">
                  <span className="material-symbols-outlined">filter_list</span>
                  <select
                    value={searchField}
                    onChange={(event) => {
                      const value = event.target.value as
                        | "trace"
                        | "account"
                        | "exception"
                        | "retriable";
                      setSearchField(value);
                      if (value === "account") {
                        setSearchValue(accountNumber);
                      } else if (value === "exception") {
                        setSearchValue(exceptionType);
                      } else if (value === "trace") {
                        setSearchValue(searchTerm);
                      } else if (value === "retriable") {
                        if (retriableInput === "all") {
                          setRetriableInput("true");
                        }
                        setSearchValue("");
                      }
                    }}
                  >
                    <option value="trace">Correlation ID</option>
                    <option value="account">Account Number</option>
                    {tab === "failures" ? <option value="exception">Exception Type</option> : null}
                    {tab === "failures" ? <option value="retriable">Retriable</option> : null}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Value</label>
                {searchField === "retriable" ? (
                  <div className="select">
                    <span className="material-symbols-outlined">fact_check</span>
                    <select
                      value={retriableInput === "all" ? "true" : retriableInput}
                      onChange={(event) =>
                        setRetriableInput(event.target.value as "true" | "false")
                      }
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                ) : searchField === "exception" ? (
                  <div className="select">
                    <span className="material-symbols-outlined">error</span>
                    <select
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                      disabled={exceptionOptionsLoading}
                    >
                      <option value="">{exceptionSelectLabel}</option>
                      {exceptionOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="search">
                    <span className="material-symbols-outlined">search</span>
                    <input
                      placeholder={searchValuePlaceholder}
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          applyFilters();
                        }
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="field">
                <label>From</label>
                <div className="datetime-group">
                  <input
                    className="datetime-input"
                    type="datetime-local"
                    value={fromDateTimeInput}
                    onChange={(event) => setFromDateTimeInput(event.target.value)}
                    step="60"
                  />
                </div>
              </div>
              <div className="field">
                <label>To</label>
                <div className="datetime-group">
                  <input
                    className="datetime-input"
                    type="datetime-local"
                    value={toDateTimeInput}
                    onChange={(event) => setToDateTimeInput(event.target.value)}
                    step="60"
                  />
                </div>
              </div>
              <div className="filter-actions inline-actions">
                <button className="button ghost small" onClick={clearFilters} type="button">
                  Clear
                </button>
                <button className="button primary small" onClick={applyFilters} type="button">
                  Apply
                </button>
              </div>
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
                : `Showing ${rowOffset + 1} to ${rowOffset + rows.length} of ${formatNumber(total)}`}
            </span>
            <div className="pager">
              <div className="page-info">
                Page {Math.min(page + 1, totalPages)} of {totalPages}
              </div>
              <label className="page-jump">
                <span>Go to</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={(event) => setPageInput(event.target.value)}
                  onBlur={() => {
                    const parsed = Number(pageInput);
                    if (!Number.isFinite(parsed)) {
                      setPageInput(String(page + 1));
                      return;
                    }
                    const clamped = clamp(Math.round(parsed), 1, totalPages);
                    if (clamped - 1 !== page) {
                      setPage(clamped - 1);
                    }
                    setPageInput(String(clamped));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                />
              </label>
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

function HourlyTrendsPanel({
  title,
  subtitle,
  buckets,
  loading,
  error,
  intervalSelect,
  intervalMinutes,
}: {
  title: string;
  subtitle: string;
  buckets: BucketPoint[];
  loading?: boolean;
  error?: string | null;
  intervalSelect?: ReactNode;
  intervalMinutes?: number;
}) {
  const rangeOptions = [1, 6, 12, 24];
  const [rangeHours, setRangeHours] = useState(24);
  const [smoothLines, setSmoothLines] = useState(true);
  const [bridgeGaps, setBridgeGaps] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const linesRef = useRef<HTMLDivElement | null>(null);
  const sortedBuckets = useMemo(() => {
    if (buckets.length <= 1) {
      return buckets;
    }
    return [...buckets].sort((left, right) => {
      const leftTime = parseDate(left.bucketStart)?.getTime() ?? 0;
      const rightTime = parseDate(right.bucketStart)?.getTime() ?? 0;
      return leftTime - rightTime;
    });
  }, [buckets]);
  const inferredIntervalMs = useMemo(() => {
    if (sortedBuckets.length < 2) {
      return 60 * 60 * 1000;
    }
    const lastTime = parseDate(sortedBuckets[sortedBuckets.length - 1]?.bucketStart)?.getTime();
    const prevTime = parseDate(sortedBuckets[sortedBuckets.length - 2]?.bucketStart)?.getTime();
    if (!lastTime || !prevTime) {
      return 60 * 60 * 1000;
    }
    return Math.max(1, lastTime - prevTime);
  }, [sortedBuckets]);
  const bucketIntervalMinutes = useMemo(() => {
    if (intervalMinutes && intervalMinutes > 0) {
      return intervalMinutes;
    }
    return Math.max(1, Math.round(inferredIntervalMs / 60000));
  }, [inferredIntervalMs, intervalMinutes]);
  const bucketIntervalMs = bucketIntervalMinutes * 60 * 1000;
  const isToday = useMemo(() => {
    if (!sortedBuckets.length) {
      return false;
    }
    const first = parseDate(sortedBuckets[0]?.bucketStart);
    if (!first) {
      return false;
    }
    const now = new Date();
    return (
      first.getFullYear() === now.getFullYear() &&
      first.getMonth() === now.getMonth() &&
      first.getDate() === now.getDate()
    );
  }, [sortedBuckets]);
  const rangeEndTime = useMemo(() => {
    if (!sortedBuckets.length) {
      return null;
    }
    const first = parseDate(sortedBuckets[0]?.bucketStart);
    const last = parseDate(sortedBuckets[sortedBuckets.length - 1]?.bucketStart);
    if (!first || !last) {
      return null;
    }
    const now = new Date();
    if (!isToday) {
      return last.getTime() + bucketIntervalMs;
    }
    return now.getTime();
  }, [bucketIntervalMs, isToday, sortedBuckets]);
  const displayBuckets = useMemo(() => {
    if (!sortedBuckets.length) {
      return sortedBuckets;
    }
    const endExclusive = rangeEndTime ?? (isToday ? Date.now() : null);
    if (rangeHours >= 24) {
      if (!isToday || !endExclusive) {
        return sortedBuckets;
      }
      const filtered = sortedBuckets.filter((bucket) => {
        const time = parseDate(bucket.bucketStart)?.getTime();
        return typeof time === "number" && !Number.isNaN(time) && time < endExclusive;
      });
      if (filtered.length >= 2) {
        return filtered;
      }
      return sortedBuckets.slice(-Math.min(2, sortedBuckets.length));
    }
    if (!endExclusive) {
      return sortedBuckets;
    }
    const cutoff = endExclusive - rangeHours * 60 * 60 * 1000;
    const filtered = sortedBuckets.filter((bucket) => {
      const time = parseDate(bucket.bucketStart)?.getTime();
      return (
        typeof time === "number" &&
        !Number.isNaN(time) &&
        time >= cutoff &&
        time < endExclusive
      );
    });
    if (rangeHours === 1 && filtered.length >= 1) {
      return filtered;
    }
    if (filtered.length >= 2) {
      return filtered;
    }
    return sortedBuckets.slice(-Math.min(2, sortedBuckets.length));
  }, [bucketIntervalMs, isToday, rangeEndTime, rangeHours, sortedBuckets]);
  const hasData = displayBuckets.length > 0;
  const axisLabels = useMemo(() => {
    if (rangeHours === 1) {
      const labels = displayBuckets.map((bucket) => formatAxisTime(bucket.bucketStart));
      if (displayBuckets.length) {
        const lastStart = parseDate(displayBuckets[displayBuckets.length - 1]?.bucketStart);
        const endLabel = lastStart
          ? formatAxisTime(new Date(lastStart.getTime() + bucketIntervalMinutes * 60 * 1000))
          : null;
        if (endLabel) {
          labels.push(endLabel);
        }
      }
      return labels;
    }
    return getAxisLabels(displayBuckets, 7, bucketIntervalMinutes, false);
  }, [bucketIntervalMinutes, displayBuckets, rangeHours]);
  const rawLatencyValues = useMemo(
    () => displayBuckets.map((bucket) => bucket.avgLatencyMs ?? 0),
    [displayBuckets]
  );
  const rawSuccessRates = useMemo(() => {
    return displayBuckets.map((bucket) => {
      const total = bucket.total || bucket.success + bucket.failure;
      return total > 0 ? (bucket.success / total) * 100 : bucket.successRate ?? 0;
    });
  }, [displayBuckets]);
  const rawFailureRates = useMemo(() => {
    return displayBuckets.map((bucket) => {
      const total = bucket.total || bucket.success + bucket.failure;
      return total > 0 ? (bucket.failure / total) * 100 : 0;
    });
  }, [displayBuckets]);
  const smoothLatencyValues = useMemo(
    () => (smoothLines ? smoothSeries(rawLatencyValues, 3) : rawLatencyValues),
    [rawLatencyValues, smoothLines]
  );
  const smoothSuccessRates = useMemo(
    () => (smoothLines ? smoothSeries(rawSuccessRates, 3) : rawSuccessRates),
    [rawSuccessRates, smoothLines]
  );
  const smoothFailureRates = useMemo(
    () => (smoothLines ? smoothSeries(rawFailureRates, 3) : rawFailureRates),
    [rawFailureRates, smoothLines]
  );
  const latencyMax = useMemo(() => {
    const maxValue = Math.max(...rawLatencyValues, 0);
    return maxValue > 0 ? getNiceMax(maxValue) : 1;
  }, [rawLatencyValues]);
  const timeBounds = useMemo(() => {
    const endExclusive = rangeEndTime ?? (isToday ? Date.now() : null);
    if (endExclusive && rangeHours > 0) {
      const min = endExclusive - rangeHours * 60 * 60 * 1000;
      return { min, max: endExclusive };
    }
    const times = displayBuckets
      .map((bucket) => parseDate(bucket.bucketStart)?.getTime())
      .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
    if (!times.length) {
      return null;
    }
    const min = Math.min(...times);
    const max = Math.max(...times);
    return { min, max: max === min ? min + 1 : max };
  }, [displayBuckets, isToday, rangeEndTime, rangeHours]);
  const points = useMemo(() => {
    const count = displayBuckets.length;
    return displayBuckets.map((bucket, index) => {
      const rawSuccessRate = rawSuccessRates[index] ?? 0;
      const rawFailureRate = rawFailureRates[index] ?? 0;
      const rawLatencyValue = rawLatencyValues[index] ?? 0;
      const successRate = smoothSuccessRates[index] ?? rawSuccessRate;
      const failureRate = smoothFailureRates[index] ?? rawFailureRate;
      const latencyValue = smoothLatencyValues[index] ?? rawLatencyValue;
      const time = parseDate(bucket.bucketStart)?.getTime();
      const bucketTime =
        typeof time === "number" && !Number.isNaN(time) ? time + bucketIntervalMs * 0.5 : null;
      const x = timeBounds
        ? (clamp((bucketTime ?? timeBounds.min) - timeBounds.min, 0, timeBounds.max - timeBounds.min) /
            (timeBounds.max - timeBounds.min)) *
          100
        : count <= 1
        ? 0
        : (index / (count - 1)) * 100;
      const hasTotal = bucket.total > 0;
      const hasLatency = bucket.success > 0;
      return {
        x,
        successRate,
        failureRate,
        latencyValue,
        rawSuccessRate,
        rawFailureRate,
        rawLatencyValue,
        hasTotal,
        hasLatency,
        successY: clamp(100 - clamp(successRate, 0, 100), 2, 98),
        failureY: clamp(100 - clamp(failureRate, 0, 100), 2, 98),
        latencyY: clamp(100 - (clamp(latencyValue, 0, latencyMax) / latencyMax) * 100, 2, 98),
      };
    });
  }, [
    displayBuckets,
    timeBounds,
    latencyMax,
    rawSuccessRates,
    rawFailureRates,
    rawLatencyValues,
    smoothSuccessRates,
    smoothFailureRates,
    smoothLatencyValues,
  ]);
  const successPoints = points.map((point) => ({ x: point.x, y: point.successY }));
  const failurePoints = points.map((point) => ({ x: point.x, y: point.failureY }));
  const latencyPoints = points.map((point) => ({ x: point.x, y: point.latencyY }));
  const successVisibility = points.map((point) => (bridgeGaps ? true : point.hasTotal));
  const failureVisibility = points.map((point) => (bridgeGaps ? true : point.hasTotal));
  const latencyVisibility = points.map((point) => (bridgeGaps ? true : point.hasLatency));
  const successPath = bridgeGaps
    ? buildLinePath(successPoints)
    : buildLinePathWithGaps(successPoints, successVisibility);
  const failurePath = bridgeGaps
    ? buildLinePath(failurePoints)
    : buildLinePathWithGaps(failurePoints, failureVisibility);
  const latencyPath = bridgeGaps
    ? buildLinePath(latencyPoints)
    : buildLinePathWithGaps(latencyPoints, latencyVisibility);
  const latencyAreaPath = bridgeGaps ? buildAreaPath(latencyPoints) : "";
  const maxTotal = useMemo(
    () =>
      displayBuckets.reduce((max, bucket) => {
        const value = Number.isFinite(bucket.total) ? bucket.total : 0;
        return value > max ? value : max;
      }, 0),
    [displayBuckets]
  );
  const barWidth = useMemo(() => {
    if (points.length <= 1) {
      return 6;
    }
    const rough = 70 / points.length;
    return clamp(rough, 1.6, 6);
  }, [points.length]);
  const bars = useMemo(() => {
    return displayBuckets.map((bucket, index) => {
      const total = Number.isFinite(bucket.total) ? bucket.total : 0;
      const height = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
      const time = parseDate(bucket.bucketStart)?.getTime();
      const isFuture = isToday && typeof time === "number" && time > Date.now();
      const x = points[index]?.x ?? 0;
      return { x, height, isFuture };
    });
  }, [displayBuckets, maxTotal, points, isToday]);

  const focusIndex = useMemo(() => {
    if (!points.length) {
      return -1;
    }
    return points.reduce((maxIndex, point, index) => {
      return point.failureRate > points[maxIndex].failureRate ? index : maxIndex;
    }, 0);
  }, [points]);
  const activeIndex = hoverIndex ?? focusIndex;
  const activePoint = activeIndex >= 0 ? points[activeIndex] : null;
  const activeBucket = activeIndex >= 0 ? displayBuckets[activeIndex] : null;
  const activeX = activePoint ? activePoint.x : 0;
  const tooltipLeft = clamp(activeX, 8, 92);
  const latencyLabel =
    activePoint && activeBucket && activeBucket.success > 0
      ? formatLatency(activePoint.rawLatencyValue)
      : "--";

  const latencyTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => Math.round(latencyMax * ratio));
  const handleMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!points.length) {
        return;
      }
      const bounds = linesRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width === 0) {
        return;
      }
      const relative = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
      const targetX = relative * 100;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;
      points.forEach((point, index) => {
        const distance = Math.abs(point.x - targetX);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });
      setHoverIndex(nearestIndex);
    },
    [points]
  );

  useEffect(() => {
    setHoverIndex(null);
  }, [displayBuckets, rangeHours]);

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
        {intervalSelect ? <div className="trend-center">{intervalSelect}</div> : null}
        <div className="trend-controls">
          <div className="trend-legend">
            <span className="legend success">
              <i />
              Success rate
            </span>
            <span className="legend failure">
              <i />
              Failure rate
            </span>
            <span className="legend latency">
              <i />
              Latency
            </span>
            <span className="legend volume">
              <i />
              Volume
            </span>
          </div>
          <div className="trend-range">
            {rangeOptions.map((hours) => (
              <button
                key={hours}
                type="button"
                className={hours === rangeHours ? "active" : undefined}
                aria-pressed={hours === rangeHours}
                onClick={() => setRangeHours(hours)}
              >
                {hours}H
              </button>
            ))}
          </div>
          <div className="trend-range">
            <button
              type="button"
              className={smoothLines ? "active" : undefined}
              aria-pressed={smoothLines}
              onClick={() => setSmoothLines((value) => !value)}
            >
              Smooth
            </button>
            <button
              type="button"
              className={bridgeGaps ? "active" : undefined}
              aria-pressed={bridgeGaps}
              onClick={() => setBridgeGaps((value) => !value)}
            >
              Bridge gaps
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
            <div className="trend-chart" onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIndex(null)}>
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
              <div className="trend-bars">
                {bars.map((bar, index) => (
                  <span
                    key={`bar-${index}`}
                    className={`trend-bar${bar.isFuture ? " future" : ""}`}
                    style={{
                      left: `${bar.x}%`,
                      height: `${bar.height}%`,
                      width: `${barWidth}%`,
                    }}
                  />
                ))}
              </div>
              <div className="trend-lines" ref={linesRef}>
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
                {activePoint && <div className="trend-marker" style={{ left: `${activeX}%` }} />}
                {activePoint && (
                  <>
                    <div className="trend-point success" style={{ left: `${activeX}%`, top: `${activePoint.successY}%` }} />
                    <div className="trend-point failure" style={{ left: `${activeX}%`, top: `${activePoint.failureY}%` }} />
                    <div className="trend-point latency" style={{ left: `${activeX}%`, top: `${activePoint.latencyY}%` }} />
                  </>
                )}
                {activePoint && activeBucket && (
                  <div className="trend-tooltip" style={{ left: `${tooltipLeft}%` }}>
                    <div className="trend-tooltip-header">
                      <span className="mono">
                        {formatTooltipRange(activeBucket.bucketStart, bucketIntervalMinutes)}
                      </span>
                      {activePoint.rawFailureRate > 5 && <span className="trend-flag">Issue</span>}
                    </div>
                    <div className="trend-tooltip-grid">
                      <span className="dot success" />
                      <span>Success rate</span>
                      <span className="mono">{formatPercent(activePoint.rawSuccessRate)}</span>
                      <span className="dot success" />
                      <span>Success count</span>
                      <span className="mono">{formatNumber(activeBucket.success)}</span>
                      <span className="dot failure" />
                      <span>Failure rate</span>
                      <span className="mono">{formatPercent(activePoint.rawFailureRate)}</span>
                      <span className="dot failure" />
                      <span>Failure count</span>
                      <span className="mono">{formatNumber(activeBucket.failure)}</span>
                      <span className="dot latency" />
                      <span>Latency</span>
                      <span className="mono">{latencyLabel}</span>
                      {activeBucket.failureSources?.length ? (
                        <>
                          <span className="dot failure" />
                          <span>Failure source</span>
                          <span className="mono">
                            {formatSourceList(activeBucket.failureSources)}
                          </span>
                        </>
                      ) : null}
                    </div>
                    <div className="trend-tooltip-arrow" />
                  </div>
                )}
              </div>
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
