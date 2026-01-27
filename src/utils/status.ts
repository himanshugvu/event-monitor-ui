import type { StatusTone } from "../types";

export const statusLabels: Record<StatusTone, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
};

export const getStatusTone = (successRate?: number, total?: number): StatusTone => {
  if (total === 0) {
    return "warning";
  }
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
