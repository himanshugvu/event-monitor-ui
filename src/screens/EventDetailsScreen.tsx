import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, postNoContent } from "../api/client";
import { CalendarPicker } from "../components/CalendarPicker";
import { DateField } from "../components/DateField";
import { HourlyTrendsPanel } from "../components/HourlyTrendsPanel";
import { KpiCard } from "../components/KpiCard";
import { PayloadBlock } from "../components/PayloadBlock";
import { RefreshMenu } from "../components/RefreshMenu";
import type {
  DayMode,
  EventBucketsResponse,
  EventCatalogItem,
  EventSummaryResponse,
  FailureRow,
  LatencyMetric,
  PagedRowsResponse,
  SuccessRow,
} from "../types";
import { clamp } from "../utils/chart";
import { splitDateTimeInput } from "../utils/date";
import { isAbortError } from "../utils/errors";
import {
  formatDateTime,
  formatLatency,
  formatNumber,
  formatPayload,
  formatPercent,
  formatTimeAgo,
  toDisplayValue,
} from "../utils/format";
import {
  calculateLatencyMs,
  formatLatencyPair,
  latencyMetricLabel,
  parseLatencyFilterValue,
  pickLatencyMetricValue,
} from "../utils/latency";
import { buildQuery } from "../utils/query";
import { resolveSearch } from "../utils/search";

export type EventDetailsScreenProps = {
  day: string;
  dayMode: DayMode;
  onDayModeChange: (value: DayMode) => void;
  onDayChange: (value: string) => void;
  selectedEvent: string;
  onSelectEvent: (value: string) => void;
  eventCatalog: EventCatalogItem[];
  latencyMetric: LatencyMetric;
  onLatencyMetricToggle: () => void;
  onHeaderControls?: (node: ReactNode) => void;
};

export function EventDetailsScreen({
  day,
  dayMode,
  onDayModeChange,
  onDayChange,
  selectedEvent,
  onSelectEvent,
  eventCatalog,
  latencyMetric,
  onLatencyMetricToggle,
  onHeaderControls,
}: EventDetailsScreenProps) {
  const [summary, setSummary] = useState<EventSummaryResponse | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);
    const [buckets, setBuckets] = useState<EventBucketsResponse | null>(null);
    const [bucketsLoading, setBucketsLoading] = useState(false);
    const [bucketsError, setBucketsError] = useState<string | null>(null);
    const [refreshIndex, setRefreshIndex] = useState(0);
    const [forceRefreshToken, setForceRefreshToken] = useState(0);
    const bucketInterval = 60;
    const summaryBaselineRef = useRef<string | null>(null);
  const [tab, setTab] = useState<"success" | "failures">("success");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState<
    "trace" | "account" | "exception" | "retriable" | "latency" | "latencyReceived"
  >("trace");
  const [searchValue, setSearchValue] = useState("");
  const [latencyFilterInput, setLatencyFilterInput] = useState({
    mode: "gt" as "gt" | "between",
    min: "",
    max: "",
  });
  const [receivedLatencyFilterInput, setReceivedLatencyFilterInput] = useState({
    mode: "gt" as "gt" | "between",
    min: "",
    max: "",
  });
  const [latencyFilter, setLatencyFilter] = useState({
    mode: "gt" as "gt" | "between",
    min: "",
    max: "",
  });
  const [receivedLatencyFilter, setReceivedLatencyFilter] = useState({
    mode: "gt" as "gt" | "between",
    min: "",
    max: "",
  });
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
  const [successTotalLoaded, setSuccessTotalLoaded] = useState(false);
  const [failureTotal, setFailureTotal] = useState(0);
  const [failureTotalLoaded, setFailureTotalLoaded] = useState(false);
  const [successPageInput, setSuccessPageInput] = useState("1");
  const [failurePageInput, setFailurePageInput] = useState("1");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<SuccessRow | FailureRow | null>(null);
  const pageSize = 50;
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
      `/api/v1/days/${day}/events/${selectedEvent}/summary${
        refreshIndex > 0 ? `?refresh=true&nonce=${refreshIndex}` : ""
      }`,
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
      `/api/v1/days/${day}/events/${selectedEvent}/buckets?intervalMinutes=${bucketInterval}${
        refreshIndex > 0 ? `&refresh=true&nonce=${refreshIndex}` : ""
      }`,
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
      if (!forceRefreshToken) {
        summaryBaselineRef.current = null;
        return;
      }
      if (summary?.day === day && summary?.eventKey === selectedEvent) {
        summaryBaselineRef.current = summary.generatedAt;
      } else {
        summaryBaselineRef.current = null;
      }
    }, [day, forceRefreshToken, selectedEvent, summary?.day, summary?.eventKey, summary?.generatedAt]);

    useEffect(() => {
      if (!forceRefreshToken || !selectedEvent) {
        return;
      }
      const baseline = summaryBaselineRef.current;
      let cancelled = false;
      let timeoutId: number | null = null;
      let controller: AbortController | null = null;
      const poll = () => {
        if (cancelled) {
          return;
        }
        controller?.abort();
        controller = new AbortController();
        const nonce = `${forceRefreshToken}-${Date.now()}`;
        fetchJson<EventSummaryResponse>(
          `/api/v1/days/${day}/events/${selectedEvent}/summary?nonce=${nonce}`,
          controller.signal
        )
          .then((data) => {
            if (cancelled) {
              return;
            }
            if (!baseline || data.generatedAt !== baseline) {
              setSummary(data);
              setSummaryError(null);
              const bucketsController = new AbortController();
              setBucketsLoading(true);
              fetchJson<EventBucketsResponse>(
                `/api/v1/days/${day}/events/${selectedEvent}/buckets?intervalMinutes=${bucketInterval}&nonce=${nonce}`,
                bucketsController.signal
              )
                .then((bucketData) => {
                  if (!cancelled) {
                    setBuckets(bucketData);
                    setBucketsError(null);
                  }
                })
                .catch((error) => {
                  if (!isAbortError(error)) {
                    setBucketsError(error instanceof Error ? error.message : String(error));
                  }
                })
                .finally(() => {
                  if (!cancelled && !bucketsController.signal.aborted) {
                    setBucketsLoading(false);
                  }
                });
              return;
            }
            timeoutId = window.setTimeout(poll, 10000);
          })
          .catch((error) => {
            if (!isAbortError(error)) {
              setSummaryError(error instanceof Error ? error.message : String(error));
              timeoutId = window.setTimeout(poll, 10000);
            }
          });
      };
      poll();
      return () => {
        cancelled = true;
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        controller?.abort();
      };
    }, [bucketInterval, day, forceRefreshToken, selectedEvent]);

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
      setTab("success");
      setSearchTerm("");
      setSearchField("trace");
      setSearchValue("");
      setLatencyFilterInput({ mode: "gt", min: "", max: "" });
      setReceivedLatencyFilterInput({ mode: "gt", min: "", max: "" });
      setLatencyFilter({ mode: "gt", min: "", max: "" });
      setReceivedLatencyFilter({ mode: "gt", min: "", max: "" });
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
      setSuccessTotalLoaded(false);
      const { traceId, messageKey } = resolveSearch(searchTerm);
      const { date: fromDate, time: fromTime } = splitDateTimeInput(fromDateTime);
      const { date: toDate, time: toTime } = splitDateTimeInput(toDateTime);
      const latencyMin = parseLatencyFilterValue(latencyFilter.min);
      const latencyMax =
        latencyFilter.mode === "between" ? parseLatencyFilterValue(latencyFilter.max) : undefined;
      const receivedLatencyMin = parseLatencyFilterValue(receivedLatencyFilter.min);
      const receivedLatencyMax =
        receivedLatencyFilter.mode === "between"
          ? parseLatencyFilterValue(receivedLatencyFilter.max)
          : undefined;
      const query = buildQuery({
        page: successPage,
        size: pageSize,
        traceId,
        messageKey,
        accountNumber: accountNumber.trim(),
        latencyMin,
        latencyMax,
        receivedLatencyMin,
        receivedLatencyMax,
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
        setSuccessTotalLoaded(true);
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
    }, [
      tab,
      day,
      selectedEvent,
      successPage,
      searchTerm,
      accountNumber,
      fromDateTime,
      toDateTime,
      latencyFilter,
      receivedLatencyFilter,
      refreshIndex,
    ]);

  useEffect(() => {
    if (tab !== "failures" || !selectedEvent) {
      return;
    }
    const controller = new AbortController();
      setFailureLoading(true);
      setFailureError(null);
      setFailureTotalLoaded(false);
      const { traceId, messageKey } = resolveSearch(searchTerm);
      const { date: fromDate, time: fromTime } = splitDateTimeInput(fromDateTime);
      const { date: toDate, time: toTime } = splitDateTimeInput(toDateTime);
      const latencyMin = parseLatencyFilterValue(latencyFilter.min);
      const latencyMax =
        latencyFilter.mode === "between" ? parseLatencyFilterValue(latencyFilter.max) : undefined;
      const receivedLatencyMin = parseLatencyFilterValue(receivedLatencyFilter.min);
      const receivedLatencyMax =
        receivedLatencyFilter.mode === "between"
          ? parseLatencyFilterValue(receivedLatencyFilter.max)
          : undefined;
      const query = buildQuery({
        page: failurePage,
        size: pageSize,
        traceId,
        messageKey,
        accountNumber: accountNumber.trim(),
        exceptionType: exceptionType.trim(),
        retriable:
          retriable === "all" ? undefined : retriable === "true" ? true : retriable === "false" ? false : undefined,
        latencyMin,
        latencyMax,
        receivedLatencyMin,
        receivedLatencyMax,
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
        setFailureTotalLoaded(true);
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
      latencyFilter,
      receivedLatencyFilter,
      refreshIndex,
    ]);

  const rows = tab === "success" ? successRows : failureRows;
  const rowsLoading = tab === "success" ? successLoading : failureLoading;
  const rowsError = tab === "success" ? successError : failureError;
  const page = tab === "success" ? successPage : failurePage;
  const setPage = tab === "success" ? setSuccessPage : setFailurePage;
  const total = tab === "success" ? successTotal : failureTotal;
  const successTabCount = successTotalLoaded ? successTotal : summary?.kpis.success;
  const failureTabCount = failureTotalLoaded ? failureTotal : summary?.kpis.failure;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
  const canPrev = page > 0;
  const canNext = page < totalPages - 1;
  const rowOffset = page * pageSize;
  const pageInput = tab === "success" ? successPageInput : failurePageInput;
  const setPageInput = tab === "success" ? setSuccessPageInput : setFailurePageInput;
  const bucketPoints = buckets?.buckets ?? [];
  const updatedText = summaryLoading
    ? "Loading..."
    : summary?.generatedAt
    ? `Updated ${formatTimeAgo(summary.generatedAt)}`
    : "Not loaded";
    const isLatencyFilter = searchField === "latency" || searchField === "latencyReceived";
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
  const showReplay = tab === "failures" && !!selectedRow && "exception_type" in selectedRow;

    const applyFilters = () => {
      const trimmedSearch = searchValue.trim();
      setSearchTerm("");
      setAccountNumber("");
      setExceptionType("");
      setRetriable("all");
      setLatencyFilter({ mode: "gt", min: "", max: "" });
      setReceivedLatencyFilter({ mode: "gt", min: "", max: "" });
      if (searchField === "trace") {
        setSearchTerm(trimmedSearch);
      } else if (searchField === "account") {
        setAccountNumber(trimmedSearch);
      } else if (searchField === "exception") {
        setExceptionType(trimmedSearch);
      } else if (searchField === "retriable") {
        setRetriable(retriableInput === "all" ? "true" : retriableInput);
      } else if (searchField === "latency") {
        setLatencyFilter({ ...latencyFilterInput });
      } else if (searchField === "latencyReceived") {
        setReceivedLatencyFilter({ ...receivedLatencyFilterInput });
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
      setLatencyFilterInput({ mode: "gt", min: "", max: "" });
      setReceivedLatencyFilterInput({ mode: "gt", min: "", max: "" });
      setLatencyFilter({ mode: "gt", min: "", max: "" });
      setReceivedLatencyFilter({ mode: "gt", min: "", max: "" });
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
    if (!selectedEvent || !row.id) {
      return;
    }
    const needsPayload =
      !row.source_payload &&
      !row.transformed_payload &&
      (!("exception_stack" in row) || !row.exception_stack);
    if (!needsPayload) {
      return;
    }
    const id = String(row.id);
    const detailPath =
      "exception_type" in row
        ? `/api/v1/days/${day}/events/${selectedEvent}/failures/${id}`
        : `/api/v1/days/${day}/events/${selectedEvent}/success/${id}`;
    fetchJson<SuccessRow | FailureRow>(detailPath)
      .then((data) => {
        setSelectedRow((current) => {
          if (!current || String(current.id) !== id) {
            return current;
          }
          return data;
        });
      })
      .catch((error) => {
        console.error("Failed to load row details", error);
      });
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
    const handleForceRefresh = useCallback(() => {
      if (!selectedEvent) {
        return;
      }
      setSummaryError(null);
      postNoContent(`/api/v1/refresh/events/${selectedEvent}`)
        .then(() => {
          setForceRefreshToken(Date.now());
        })
        .catch((error) => {
          console.error("Event force refresh failed", error);
          setSummaryError(error instanceof Error ? error.message : String(error));
        });
    }, [selectedEvent]);

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
        <RefreshMenu
          onRefresh={handleRefresh}
          onHardRefresh={handleForceRefresh}
          updatedText={updatedText}
        />
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
          title="Received Latency"
          value={
            summary
              ? formatLatencyPair(
                  summary.stageLatencies?.avgReceivedLatencyMs,
                  pickLatencyMetricValue(
                    latencyMetric,
                    summary.stageLatencies?.p95ReceivedLatencyMs,
                    summary.stageLatencies?.p99ReceivedLatencyMs,
                    summary.stageLatencies?.maxReceivedLatencyMs
                  ),
                  latencyMetricLabel(latencyMetric)
                )
              : "--"
          }
          icon="call_received"
          tone="info"
          valueClassName="latency-value"
          onIconClick={onLatencyMetricToggle}
        />
        <KpiCard
          title="Sent Latency"
          value={
            summary
              ? formatLatencyPair(
                  summary.stageLatencies?.avgSentLatencyMs,
                  pickLatencyMetricValue(
                    latencyMetric,
                    summary.stageLatencies?.p95SentLatencyMs,
                    summary.stageLatencies?.p99SentLatencyMs,
                    summary.stageLatencies?.maxSentLatencyMs
                  ),
                  latencyMetricLabel(latencyMetric)
                )
              : "--"
          }
          icon="call_made"
          tone="info"
          valueClassName="latency-value"
          onIconClick={onLatencyMetricToggle}
        />
        <KpiCard
          title="Latency"
          value={
            summary
              ? formatLatencyPair(
                  summary.kpis.avgLatencyMs,
                  pickLatencyMetricValue(
                    latencyMetric,
                    summary.kpis.p95LatencyMs,
                    summary.kpis.p99LatencyMs,
                    summary.kpis.maxLatencyMs
                  ),
                  latencyMetricLabel(latencyMetric)
                )
              : "--"
          }
          icon="timer"
          tone="info"
          valueClassName="latency-value"
          onIconClick={onLatencyMetricToggle}
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
              Success{" "}
              <span className="tab-count">
                {typeof successTabCount === "number" ? formatNumber(successTabCount) : "--"}
              </span>
            </button>
            <button className={tab === "failures" ? "tab active" : "tab"} onClick={() => setTab("failures")}>
              Failures{" "}
              <span className="tab-count danger">
                {typeof failureTabCount === "number" ? formatNumber(failureTabCount) : "--"}
              </span>
            </button>
          </div>

          <div className="filter-panel">
            <div className={`filter-grid${isLatencyFilter ? " latency-mode" : ""}`}>
                <div className="field">
                  <label>Search by</label>
                  <div className="select">
                    <span className="material-symbols-outlined">filter_list</span>
                    <select
                      className={isLatencyFilter ? "latency-search" : undefined}
                      value={searchField}
                      onChange={(event) => {
                        const value = event.target.value as
                          | "trace"
                          | "account"
                          | "exception"
                          | "retriable"
                          | "latency"
                          | "latencyReceived";
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
                        } else if (value === "latency" || value === "latencyReceived") {
                          setSearchValue("");
                        }
                      }}
                    >
                      <option value="trace">Correlation ID</option>
                      <option value="account">Account Number</option>
                      <option value="latency">Latency</option>
                      <option value="latencyReceived">Latency received</option>
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
                  ) : isLatencyFilter ? (
                    <div
                      className={`latency-filter ${
                        (searchField === "latency"
                          ? latencyFilterInput.mode
                          : receivedLatencyFilterInput.mode) === "between"
                          ? "between"
                          : "single"
                      }`}
                    >
                      <div className="latency-mode">
                        <select
                          value={
                            searchField === "latency"
                              ? latencyFilterInput.mode
                              : receivedLatencyFilterInput.mode
                          }
                          onChange={(event) => {
                            const mode = event.target.value as "gt" | "between";
                            if (searchField === "latency") {
                              setLatencyFilterInput((current) => ({ ...current, mode }));
                            } else {
                              setReceivedLatencyFilterInput((current) => ({ ...current, mode }));
                            }
                          }}
                        >
                          <option value="gt">&gt;</option>
                          <option value="between">Between</option>
                        </select>
                      </div>
                      <div className="latency-input min">
                        <input
                          inputMode="numeric"
                          placeholder={
                            (searchField === "latency"
                              ? latencyFilterInput.mode
                              : receivedLatencyFilterInput.mode) === "between"
                              ? "Min"
                              : "Value"
                          }
                          value={
                            searchField === "latency"
                              ? latencyFilterInput.min
                              : receivedLatencyFilterInput.min
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            if (searchField === "latency") {
                              setLatencyFilterInput((current) => ({ ...current, min: value }));
                            } else {
                              setReceivedLatencyFilterInput((current) => ({ ...current, min: value }));
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              applyFilters();
                            }
                          }}
                        />
                        <span className="latency-unit">ms</span>
                      </div>
                      {(searchField === "latency"
                        ? latencyFilterInput.mode
                        : receivedLatencyFilterInput.mode) === "between" ? (
                        <>
                          <span className="latency-sep">to</span>
                          <div className="latency-input max">
                            <input
                              inputMode="numeric"
                              placeholder="Max"
                              value={
                                searchField === "latency"
                                  ? latencyFilterInput.max
                                  : receivedLatencyFilterInput.max
                              }
                              onChange={(event) => {
                                const value = event.target.value;
                                if (searchField === "latency") {
                                  setLatencyFilterInput((current) => ({ ...current, max: value }));
                                } else {
                                  setReceivedLatencyFilterInput((current) => ({
                                    ...current,
                                    max: value,
                                  }));
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  applyFilters();
                                }
                              }}
                            />
                            <span className="latency-unit">ms</span>
                          </div>
                        </>
                      ) : null}
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
                <CalendarPicker
                  value={fromDateTimeInput}
                  onChange={setFromDateTimeInput}
                  withTime
                  placeholder="dd/mm/yyyy --:--:--"
                  className="datetime-group"
                  showIcon
                />
              </div>
              <div className="field">
                <label>To</label>
                <CalendarPicker
                  value={toDateTimeInput}
                  onChange={setToDateTimeInput}
                  withTime
                  placeholder="dd/mm/yyyy --:--:--"
                  className="datetime-group"
                  showIcon
                />
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
                    <th>Event time</th>
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
                          <td className="mono">{formatDateTime(row.event_datetime)}</td>
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
                    <th>Event time</th>
                    <th>Trace ID</th>
                    <th>Account</th>
                    <th>Exception</th>
                    <th>Message</th>
                    <th>Retriable</th>
                    <th>Retry</th>
                    <th>Latency</th>
                    <th>Message Key</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="empty-cell">
                        No failure rows match the current filters.
                      </td>
                    </tr>
                  ) : (
                    failureRows.map((row, index) => {
                      const retriableLabel = row.retriable ? "Yes" : "No";
                      const latencyMs = calculateLatencyMs(row);
                      return (
                        <tr
                          key={row.id ?? row.event_trace_id ?? `failure-${index}`}
                          className="clickable"
                          onClick={() => openRow(row)}
                        >
                          <td className="mono">{formatDateTime(row.event_datetime)}</td>
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
                    {(() => {
                      const items = [
                        { label: "Trace ID", value: selectedRow.event_trace_id, mono: true },
                        { label: "Account", value: selectedRow.account_number, mono: true },
                        { label: "Customer Type", value: selectedRow.customer_type },
                        { label: "Event time", value: formatDateTime(selectedRow.event_datetime) },
                        { label: "Source Topic", value: selectedRow.source_topic },
                        { label: "Source Partition", value: selectedRow.source_partition_id },
                        { label: "Source Offset", value: selectedRow.source_offset },
                        { label: "Message Key", value: selectedRow.message_key, mono: true },
                      ];
                      items.splice(
                        4,
                        0,
                        { label: "Latency", value: formatLatency(calculateLatencyMs(selectedRow) ?? undefined) }
                      );
                      items.splice(5, 0, {
                        label: "Received Latency",
                        value: formatLatency(selectedRow.latency_event_received_ms),
                      });
                      if (tab !== "failures") {
                        items.splice(6, 0, {
                          label: "Sent Latency",
                          value: formatLatency(selectedRow.latency_event_sent_ms),
                        });
                      }
                      if (tab !== "failures") {
                        items.push(
                          { label: "Target Topic", value: selectedRow.target_topic },
                          { label: "Target Partition", value: selectedRow.target_partition_id },
                          { label: "Target Offset", value: selectedRow.target_offset },
                        );
                      }
                      return items;
                    })().map((item) => (
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
              {showReplay ? (
                <div className="modal-actions">
                  <button className="button primary" onClick={() => setDrawerOpen(false)}>
                    <span className="material-symbols-outlined">replay</span>
                    Replay Event
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

