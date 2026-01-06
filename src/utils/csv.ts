import type { EventRow } from "../types";
import { statusLabels } from "./status";

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

export const buildEventsCsv = (day: string, rows: EventRow[]) => {
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

export const downloadCsv = (filename: string, content: string) => {
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
