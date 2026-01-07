export type ThemeMode = "light" | "dark";
export type ScreenMode = "home" | "event";
export type StatusTone = "healthy" | "warning" | "critical";
export type DayMode = "today" | "yesterday" | "custom";
export type LatencyMetric = "p95" | "p99" | "max";

export type Kpis = {
  total: number;
  success: number;
  failure: number;
  successRate: number;
  retriableFailures: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
};

export type EventBreakdownRow = {
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

export type HomeAggregationResponse = {
  day: string;
  generatedAt: string;
  kpis: Kpis;
  stageLatencies?: {
    avgReceivedLatencyMs: number;
    p95ReceivedLatencyMs: number;
    p99ReceivedLatencyMs: number;
    maxReceivedLatencyMs: number;
    avgSentLatencyMs: number;
    p95SentLatencyMs: number;
    p99SentLatencyMs: number;
    maxSentLatencyMs: number;
  };
  events: EventBreakdownRow[];
};

export type EventSummaryResponse = {
  day: string;
  eventKey: string;
  generatedAt: string;
  kpis: Kpis;
  stageLatencies?: {
    avgReceivedLatencyMs: number;
    p95ReceivedLatencyMs: number;
    p99ReceivedLatencyMs: number;
    maxReceivedLatencyMs: number;
    avgSentLatencyMs: number;
    p95SentLatencyMs: number;
    p99SentLatencyMs: number;
    maxSentLatencyMs: number;
  };
};

export type BucketPoint = {
  bucketStart: string;
  success: number;
  failure: number;
  total: number;
  successRate: number;
  retriableFailures: number;
  avgLatencyMs: number;
  failureSources?: string[];
};

export type EventBucketsResponse = {
  day: string;
  eventKey: string;
  intervalMinutes: number;
  generatedAt: string;
  buckets: BucketPoint[];
};

export type HomeBucketsResponse = {
  day: string;
  intervalMinutes: number;
  generatedAt: string;
  buckets: BucketPoint[];
};

export type SuccessRow = {
  id?: string;
  event_trace_id?: string;
  account_number?: string;
  customer_type?: string;
  event_datetime?: unknown;
  source_topic?: string;
  source_partition_id?: number;
  source_offset?: number;
  message_key?: string;
  source_payload?: string;
  transformed_payload?: string;
  latency_ms?: number;
  latency_event_received_ms?: number;
  latency_event_sent_ms?: number;
  target_topic?: string;
  target_partition_id?: number;
  target_offset?: number;
};

export type FailureRow = SuccessRow & {
  exception_type?: string;
  exception_message?: string;
  exception_stack?: string;
  retriable?: number;
  retry_attempt?: number;
};

export type PagedRowsResponse<T> = {
  page: number;
  size: number;
  total: number;
  rows: T[];
};

export type EventCatalogItem = {
  eventKey: string;
  name: string;
  category: string;
};

export type EventRow = EventBreakdownRow & {
  name: string;
  category: string;
  status: StatusTone;
};
