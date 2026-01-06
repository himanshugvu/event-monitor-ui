import type { FailureRow, LatencyMetric, SuccessRow } from "../types";
import { formatLatency } from "./format";

export const LATENCY_METRIC_STORAGE_KEY = "event-monitor-ui-latency-metric";

export const normalizeLatencyMetric = (value?: string | null): LatencyMetric => {
  if (value === "p99" || value === "max" || value === "p95") {
    return value;
  }
  return "p95";
};

export const getInitialLatencyMetric = (): LatencyMetric =>
  normalizeLatencyMetric(window.localStorage.getItem(LATENCY_METRIC_STORAGE_KEY));

export const latencyMetricLabel = (metric: LatencyMetric) =>
  metric === "max" ? "MAX" : metric.toUpperCase();

export const pickLatencyMetricValue = (
  metric: LatencyMetric,
  p95?: number,
  p99?: number,
  max?: number
) => {
  if (metric === "p99") {
    return p99;
  }
  if (metric === "max") {
    return max;
  }
  return p95;
};

export const formatLatencyPair = (avg?: number, secondary?: number, secondaryLabel = "P95") =>
  `Avg ${formatLatency(avg)}\n${secondaryLabel} ${formatLatency(secondary)}`;

export const parseLatencyFilterValue = (value: string) => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, Math.round(parsed));
};

export const calculateLatencyMs = (row: SuccessRow | FailureRow) => {
  if (row.latency_ms === null || row.latency_ms === undefined) {
    return null;
  }
  const parsed = Number(row.latency_ms);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
};
