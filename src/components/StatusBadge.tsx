import type { StatusTone } from "../types";
import { statusLabels } from "../utils/status";

export function StatusBadge({ tone }: { tone: StatusTone }) {
  return <span className={`status-badge ${tone}`}>{statusLabels[tone]}</span>;
}
