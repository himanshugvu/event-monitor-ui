import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../api/client";
import { HourlyTrendsPanel } from "../components/HourlyTrendsPanel";
import { KpiCard } from "../components/KpiCard";
import { StatusBadge } from "../components/StatusBadge";
import type {
  BucketPoint,
  EventRow,
  HomeAggregationResponse,
  HomeBucketsResponse,
  LatencyMetric,
} from "../types";
import { buildEventsCsv, downloadCsv } from "../utils/csv";
import { isAbortError } from "../utils/errors";
import { formatLatency, formatNumber, formatPercent } from "../utils/format";
import { formatLatencyPair, latencyMetricLabel, pickLatencyMetricValue } from "../utils/latency";
import { getStatusTone } from "../utils/status";

export type HomeScreenProps = {
  day: string;
  refreshIndex: number;
  forceRefreshToken: number;
  forceRefreshError: string | null;
  onOpenEvent: (eventKey: string) => void;
  latencyMetric: LatencyMetric;
  onLatencyMetricToggle: () => void;
};

export function HomeScreen({
  day,
  refreshIndex,
  forceRefreshToken,
  forceRefreshError,
  onOpenEvent,
  latencyMetric,
  onLatencyMetricToggle,
}: HomeScreenProps) {
  const [home, setHome] = useState<HomeAggregationResponse | null>(null);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeBuckets, setHomeBuckets] = useState<BucketPoint[] | null>(null);
  const [homeBucketsLoading, setHomeBucketsLoading] = useState(false);
  const [homeBucketsError, setHomeBucketsError] = useState<string | null>(null);
  const homeBaselineRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setHomeLoading(true);
    setHomeError(null);
    fetchJson<HomeAggregationResponse>(
      `/api/v1/days/${day}/home${refreshIndex > 0 ? `?refresh=true&nonce=${refreshIndex}` : ""}`,
      controller.signal
    )
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
  }, [day, refreshIndex]);

  useEffect(() => {
    if (!forceRefreshToken) {
      homeBaselineRef.current = null;
      return;
    }
    if (home?.day === day) {
      homeBaselineRef.current = home.generatedAt;
    } else {
      homeBaselineRef.current = null;
    }
  }, [day, forceRefreshToken, home?.day, home?.generatedAt]);

  useEffect(() => {
    if (!forceRefreshToken) {
      return;
    }
    const baseline = homeBaselineRef.current;
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
      fetchJson<HomeAggregationResponse>(`/api/v1/days/${day}/home?nonce=${nonce}`, controller.signal)
        .then((data) => {
          if (cancelled) {
            return;
          }
          if (!baseline || data.generatedAt !== baseline) {
            setHome(data);
            setHomeError(null);
            return;
          }
          timeoutId = window.setTimeout(poll, 10000);
        })
        .catch((error) => {
          if (!isAbortError(error)) {
            setHomeError(error instanceof Error ? error.message : String(error));
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
  }, [day, forceRefreshToken]);

  useEffect(() => {
    if (!home) {
      setHomeBuckets(null);
      return;
    }
    const controller = new AbortController();
    setHomeBucketsLoading(true);
    setHomeBucketsError(null);
    const refreshQuery = refreshIndex > 0 ? `&refresh=true&nonce=${refreshIndex}` : "";
    fetchJson<HomeBucketsResponse>(
      `/api/v1/days/${day}/home/buckets?intervalMinutes=60${refreshQuery}`,
      controller.signal
    )
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }
        setHomeBuckets(response.buckets ?? []);
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
  }, [home, day, refreshIndex]);

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
        status: getStatusTone(event.successRate, event.total),
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
      {forceRefreshError && (
        <div className="banner error">Force refresh failed: {forceRefreshError}</div>
      )}
      {homeError && <div className="banner error">Failed to load home data: {homeError}</div>}

      <div className="kpi-grid">
        <KpiCard
          title="Total Events"
          value={home ? formatNumber(home.kpis.total) : "--"}
          icon="functions"
          tone="neutral"
        />
        <KpiCard
          title="Success"
          value={home ? formatNumber(home.kpis.success) : "--"}
          icon="check_circle"
          tone="success"
        />
        <KpiCard
          title="Failures"
          value={home ? formatNumber(home.kpis.failure) : "--"}
          icon="warning"
          tone="danger"
        />
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
          title="Received Latency"
          value={
            home
              ? formatLatencyPair(
                  home.stageLatencies?.avgReceivedLatencyMs,
                  pickLatencyMetricValue(
                    latencyMetric,
                    home.stageLatencies?.p95ReceivedLatencyMs,
                    home.stageLatencies?.p99ReceivedLatencyMs,
                    home.stageLatencies?.maxReceivedLatencyMs
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
            home
              ? formatLatencyPair(
                  home.stageLatencies?.avgSentLatencyMs,
                  pickLatencyMetricValue(
                    latencyMetric,
                    home.stageLatencies?.p95SentLatencyMs,
                    home.stageLatencies?.p99SentLatencyMs,
                    home.stageLatencies?.maxSentLatencyMs
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
            home
              ? formatLatencyPair(
                  home.kpis.avgLatencyMs,
                  pickLatencyMetricValue(
                    latencyMetric,
                    home.kpis.p95LatencyMs,
                    home.kpis.p99LatencyMs,
                    home.kpis.maxLatencyMs
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
                  <tr
                    key={event.eventKey}
                    className="clickable"
                    onClick={() => onOpenEvent(event.eventKey)}
                  >
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
