import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, postJson, postNoContent } from "../api/client";
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
import { splitDateTimeInput, toLocalDayString } from "../utils/date";
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

const pad2 = (value: number) => String(value).padStart(2, "0");

const formatLocalDateTime = (date: Date) =>
  `${toLocalDayString(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
    date.getSeconds()
  )}`;

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
    "none" | "trace" | "account" | "exception" | "retriable" | "latency" | "latencyReceived"
  >("none");
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
  const buildDefaultRange = useCallback((value: string) => {
    const today = toLocalDayString(new Date());
    return {
      from: `${value}T00:00:00`,
      to: value === today ? formatLocalDateTime(new Date()) : `${value}T23:59:59`,
    };
  }, []);
  const [fromDateTime, setFromDateTime] = useState(() => buildDefaultRange(day).from);
  const [toDateTime, setToDateTime] = useState(() => buildDefaultRange(day).to);
  const [fromDateTimeInput, setFromDateTimeInput] = useState(() => buildDefaultRange(day).from);
  const [toDateTimeInput, setToDateTimeInput] = useState(() => buildDefaultRange(day).to);
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
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionScope, setSelectionScope] = useState<"page" | "allFailed" | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);
  const [replayConfirmOpen, setReplayConfirmOpen] = useState(false);
  const [replayConfirmMode, setReplayConfirmMode] = useState<"ids" | "filters" | null>(null);
  const [replayWorking, setReplayWorking] = useState(false);
  const pageSize = 50;
  const maxReplaySelection = 50;
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
      setSearchField("none");
      setSearchValue("");
      setLatencyFilterInput({ mode: "gt", min: "", max: "" });
      setReceivedLatencyFilterInput({ mode: "gt", min: "", max: "" });
      setLatencyFilter({ mode: "gt", min: "", max: "" });
      setReceivedLatencyFilter({ mode: "gt", min: "", max: "" });
      setAccountNumber("");
      setExceptionType("");
      setRetriable("all");
      setRetriableInput("all");
      const defaults = buildDefaultRange(day);
      setFromDateTime(defaults.from);
      setToDateTime(defaults.to);
      setFromDateTimeInput(defaults.from);
      setToDateTimeInput(defaults.to);
    setSuccessPage(0);
    setFailurePage(0);
    setDrawerOpen(false);
    setSelectedRow(null);
  }, [buildDefaultRange, day, selectedEvent]);

  useEffect(() => {
    if (fromDateTimeInput || toDateTimeInput) {
      return;
    }
    const defaults = buildDefaultRange(day);
    setFromDateTime(defaults.from);
    setToDateTime(defaults.to);
    setFromDateTimeInput(defaults.from);
    setToDateTimeInput(defaults.to);
  }, [buildDefaultRange, day, fromDateTimeInput, toDateTimeInput]);

  useEffect(() => {
    if (tab !== "success") {
      return;
    }
    if (searchField === "exception" || searchField === "retriable") {
      setSearchField("none");
      setSearchValue("");
      setSearchTerm("");
      setRetriableInput("all");
    }
  }, [searchField, searchTerm, tab]);

  useEffect(() => {
    if (tab !== "success" || !selectedEvent) {
      return;
    }
    setFromDateTimeInput((current) => (current === fromDateTime ? current : fromDateTime));
    setToDateTimeInput((current) => (current === toDateTime ? current : toDateTime));
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
    setFromDateTimeInput((current) => (current === fromDateTime ? current : fromDateTime));
    setToDateTimeInput((current) => (current === toDateTime ? current : toDateTime));
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
      searchField === "none"
        ? "Select a filter"
        : searchField === "exception"
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
  const replayConfirmTitle =
    replayConfirmMode === "filters" ? "Replay All Failed" : "Replay Selected";
  const replayScopeLabel =
    replayConfirmMode === "filters" ? "All failed (filters)" : `Selected (${selectedRowIds.length})`;
  const pageSelectableIds = useMemo(
    () =>
      rows
        .map((row) => (row.id === undefined || row.id === null ? null : String(row.id)))
        .filter((value): value is string => Boolean(value)),
    [rows]
  );
  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const allPageSelected =
    pageSelectableIds.length > 0 && pageSelectableIds.every((id) => selectedRowIdSet.has(id));
  const selectionNote = selectedRowIds.length >= maxReplaySelection ? "Max 50 selected" : "";
  const { traceId: replayTraceId } = resolveSearch(searchTerm);
  const selectedRowsForReplay = useMemo(() => {
    if (!selectedRowIds.length) {
      return [];
    }
    const map = new Map(
      rows
        .filter((row) => row.id !== undefined && row.id !== null)
        .map((row) => [String(row.id), row])
    );
    return selectedRowIds.map((id) => map.get(id)).filter(Boolean);
  }, [rows, selectedRowIds]);

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

    const toggleRowSelection = (rowId: string | null) => {
      if (!rowId) {
        return;
      }
      if (selectionScope === "page") {
        setSelectionScope(null);
      }
      if (selectionScope !== "page") {
        setSelectionScope("page");
      }
      setSelectedRowIds((current) => {
        if (current.includes(rowId)) {
          return current.filter((id) => id !== rowId);
        }
        if (current.length >= maxReplaySelection) {
          return current;
        }
        return [...current, rowId];
      });
    };

  const handleReplaySelected = () => {
    if (!selectedRowIds.length || selectedRowIds.length > maxReplaySelection) {
      return;
    }
    console.info("Replay selected events", selectedRowIds);
    setSelectedRowIds([]);
    setSelectionScope(null);
  };

  const startSelectionMode = () => {
    setSelectionMode(true);
    setSelectionScope(null);
    setSelectedRowIds([]);
  };

  const startSelectionPage = () => {
    setSelectionMode(true);
    setSelectionScope("page");
    setSelectedRowIds(pageSelectableIds.slice(0, maxReplaySelection));
  };

  const startSelectionAllFailed = () => {
    setSelectionMode(true);
    setSelectionScope("allFailed");
    setSelectedRowIds([]);
  };

  const clearSelection = () => {
    setSelectedRowIds([]);
    setSelectionScope(null);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedRowIds([]);
    setSelectionScope(null);
  };

  const handleReplayAction = () => {
    if (selectionScope === "allFailed") {
      setReplayConfirmMode("filters");
      setReplayConfirmOpen(true);
      return;
    }
    setReplayConfirmMode("ids");
    setReplayConfirmOpen(true);
  };

    const confirmReplay = async () => {
      if (!replayConfirmMode) {
        return;
      }
      setReplayError(null);
      setReplayNotice(null);
      setReplayWorking(true);
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
      try {
        if (replayConfirmMode === "filters") {
          const body = {
            eventKey: selectedEvent,
            day,
            filters: {
              traceId,
              messageKey,
              accountNumber: accountNumber.trim() || null,
              exceptionType: exceptionType.trim() || null,
              retriable: retriable === "all" ? null : retriable === "true",
              retryAttemptMin: null,
              retryAttemptMax: null,
              latencyMin,
              latencyMax,
              receivedLatencyMin,
              receivedLatencyMax,
              fromDate,
              toDate,
              fromTime,
              toTime,
            },
          };
          const result = await postJson<{ requested: number; failed: number }>(
            "/api/v1/replay-jobs",
            body
          );
          setReplayNotice(
            `Replay job completed for ${result.requested} events (failed ${result.failed}).`
          );
        } else {
          const ids = selectedRowIds
            .map((id) => Number(id))
            .filter((value) => Number.isFinite(value));
          const body = {
            mode: ids.length === 1 ? "ID" : "IDS",
            eventKey: selectedEvent,
            day,
            id: ids.length === 1 ? ids[0] : null,
            ids: ids.length > 1 ? ids : null,
          };
          const result = await postJson<{ requested: number; failed: number }>(
            "/api/v1/replay",
            body
          );
          setReplayNotice(
            `Replay finished for ${result.requested} events (failed ${result.failed}).`
          );
        }
        handleRefresh();
        exitSelectionMode();
      } catch (error) {
        setReplayError(error instanceof Error ? error.message : String(error));
      } finally {
        setReplayWorking(false);
        setReplayConfirmOpen(false);
        setReplayConfirmMode(null);
      }
    };

    const closeReplayConfirm = () => {
      if (replayWorking) {
        return;
      }
      setReplayConfirmOpen(false);
      setReplayConfirmMode(null);
    };

    const clearFilters = () => {
      setSearchField("none");
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
      const defaults = buildDefaultRange(day);
      setFromDateTime(defaults.from);
      setToDateTime(defaults.to);
      setFromDateTimeInput(defaults.from);
    setToDateTimeInput(defaults.to);
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
    if (!selectionMode) {
      return;
    }
    setSelectedRowIds([]);
    if (selectionScope !== "allFailed") {
      setSelectionScope(null);
    }
  }, [
    tab,
    successPage,
    failurePage,
    searchTerm,
    accountNumber,
    exceptionType,
    retriable,
    fromDateTime,
    toDateTime,
    latencyFilter,
    receivedLatencyFilter,
    selectedEvent,
    day,
    selectionMode,
  ]);

  useEffect(() => {
    if (tab !== "failures" && selectionMode) {
      exitSelectionMode();
    }
  }, [exitSelectionMode, selectionMode, tab]);

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
          <div className="tabs-row">
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
            {tab === "failures" ? (
              <div className="tab-actions">
                {selectionMode ? (
                  <>
                    <div className="tab-status">
                      <span className="selection-note">
                        {selectionScope === "allFailed"
                          ? "All failed (current filters)"
                          : `Selected ${selectedRowIds.length}`}
                      </span>
                      {selectionNote ? (
                        <span className="selection-note secondary">{selectionNote}</span>
                      ) : null}
                    </div>
                    <div className="tab-buttons">
                      <button
                        className={`button ghost small${
                          selectionScope === "page" ? " is-active" : ""
                        }`}
                        onClick={startSelectionPage}
                        type="button"
                        aria-pressed={selectionScope === "page"}
                      >
                        Select page
                      </button>
                      <button
                        className={`button ghost small${
                          selectionScope === "allFailed" ? " is-active" : ""
                        }`}
                        onClick={startSelectionAllFailed}
                        type="button"
                        aria-pressed={selectionScope === "allFailed"}
                      >
                        Select all failed
                      </button>
                      <button
                        className="button primary small"
                        onClick={handleReplayAction}
                        type="button"
                        disabled={
                          selectionScope === "allFailed"
                            ? false
                            : !selectedRowIds.length || selectedRowIds.length > maxReplaySelection
                        }
                      >
                        Replay
                      </button>
                      <button
                        className="button ghost small"
                        onClick={clearSelection}
                        type="button"
                        disabled={selectionScope !== "allFailed" && selectedRowIds.length === 0}
                      >
                        Clear
                      </button>
                      <button className="button ghost small" onClick={exitSelectionMode} type="button">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="button ghost small replay-toggle"
                    onClick={startSelectionMode}
                    type="button"
                  >
                    <span className="material-symbols-outlined">replay</span>
                    Replay
                  </button>
                )}
              </div>
            ) : null}
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
                          | "none"
                          | "trace"
                          | "account"
                          | "exception"
                          | "retriable"
                          | "latency"
                          | "latencyReceived";
                        setSearchField(value);
                        if (value === "none") {
                          setSearchValue("");
                          setRetriableInput("all");
                        } else if (value === "account") {
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
                      <option value="none">Select filter</option>
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
                  {searchField === "none" ? (
                    <div className="search">
                      <span className="material-symbols-outlined">search</span>
                      <input placeholder={searchValuePlaceholder} value="" disabled />
                    </div>
                  ) : searchField === "retriable" ? (
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
          {replayError && <div className="banner error">Replay failed: {replayError}</div>}
          {replayNotice && <div className="banner info">{replayNotice}</div>}
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
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-cell">
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
                    {selectionMode ? <th className="right">Replay</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={selectionMode ? 10 : 9} className="empty-cell">
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
                          {selectionMode ? (
                            <td className="right" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="table-checkbox"
                                checked={
                                  row.id === undefined || row.id === null
                                    ? false
                                    : selectionScope === "allFailed"
                                    ? true
                                    : selectedRowIdSet.has(String(row.id))
                                }
                                disabled={row.id === undefined || row.id === null || selectionScope === "allFailed"}
                                onChange={() =>
                                  toggleRowSelection(
                                    row.id === undefined || row.id === null ? null : String(row.id)
                                  )
                                }
                                onClick={(event) => event.stopPropagation()}
                                aria-label="Select row for replay"
                              />
                            </td>
                          ) : null}
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

        {replayConfirmOpen && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="replay-confirm-title">
            <div className="modal-backdrop" onClick={closeReplayConfirm} />
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 id="replay-confirm-title">{replayConfirmTitle}</h3>
                  <div className="modal-meta">
                    <span className="mono">{selectedEvent}</span>
                    <span className="tag neutral">
                      {replayConfirmMode === "ids" ? `Selected ${selectedRowIds.length}` : day}
                    </span>
                  </div>
                </div>
                <button
                  className="icon-button"
                  onClick={closeReplayConfirm}
                  aria-label="Close dialog"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="modal-lede">
                  This will re-emit events to the downstream system. Please confirm the scope.
                </p>
                {replayConfirmMode === "ids" ? (
                  <div className="replay-table-wrap">
                    <div className="replay-table-title">
                      Selected events ({selectedRowIds.length})
                    </div>
                    <table className="replay-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Trace ID</th>
                          <th>Exception</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRowsForReplay.length > 0
                          ? selectedRowsForReplay.map((row, index) => (
                              <tr key={row?.id ?? `replay-row-${index}`}>
                                <td className="mono">{toDisplayValue(row?.id)}</td>
                                <td className="mono">{toDisplayValue(row?.event_trace_id)}</td>
                                <td className="mono">{toDisplayValue(row?.exception_type)}</td>
                              </tr>
                            ))
                          : selectedRowIds.map((id) => (
                              <tr key={id}>
                                <td className="mono">{id}</td>
                                <td className="mono">--</td>
                                <td className="mono">--</td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="meta-grid">
                    <div className="meta-card">
                      <span>Scope</span>
                      <strong>{replayScopeLabel}</strong>
                    </div>
                    <div className="meta-card">
                      <span>From</span>
                      <strong className="mono">{formatDateTime(fromDateTime)}</strong>
                    </div>
                    <div className="meta-card">
                      <span>To</span>
                      <strong className="mono">{formatDateTime(toDateTime)}</strong>
                    </div>
                    {replayConfirmMode === "filters" && (
                      <>
                        {replayTraceId ? (
                          <div className="meta-card">
                            <span>Trace ID</span>
                            <strong className="mono">{replayTraceId}</strong>
                          </div>
                        ) : null}
                        {accountNumber.trim() ? (
                          <div className="meta-card">
                            <span>Account</span>
                            <strong className="mono">{accountNumber}</strong>
                          </div>
                        ) : null}
                        {exceptionType.trim() ? (
                          <div className="meta-card">
                            <span>Exception</span>
                            <strong className="mono">{exceptionType}</strong>
                          </div>
                        ) : null}
                        {retriable !== "all" ? (
                          <div className="meta-card">
                            <span>Retriable</span>
                            <strong>{retriable === "true" ? "Yes" : "No"}</strong>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button
                  className="button ghost"
                  onClick={closeReplayConfirm}
                  disabled={replayWorking}
                >
                  Cancel
                </button>
                <button className="button primary" onClick={confirmReplay} disabled={replayWorking}>
                  {replayWorking ? "Replaying..." : "Confirm Replay"}
                </button>
              </div>
            </div>
          </div>
        )}

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

