import { parseDate } from "./date";

export const formatNumber = (value?: number) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return new Intl.NumberFormat("en-US").format(value);
};

export const formatPercent = (value?: number) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(2)}%`;
};

export const formatLatency = (value?: number) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "--";
  }
  return `${Math.round(value)}ms`;
};

export const formatDateTime = (value?: unknown) => {
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

export const formatTimeAgo = (value?: unknown) => {
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

export const formatPayload = (value?: string) => {
  if (!value) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

export const toDisplayValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  return String(value);
};

export const formatAxisTime = (value?: unknown) => {
  const date = parseDate(value);
  if (!date) {
    return "--:--";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

export const formatTooltipTime = (value?: unknown) => {
  const date = parseDate(value);
  if (!date) {
    return "--:--";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export const formatTooltipRange = (start?: unknown, intervalMinutes?: number) => {
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

export const formatSourceList = (sources: string[], max = 2) => {
  if (!sources.length) {
    return "--";
  }
  const unique = Array.from(new Set(sources));
  if (unique.length <= max) {
    return unique.join(", ");
  }
  return `${unique.slice(0, max).join(", ")} +${unique.length - max}`;
};
