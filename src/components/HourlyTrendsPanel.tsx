import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { BucketPoint } from "../types";
import { getAxisLabels, buildAreaPath, buildLinePath, buildLinePathWithGaps, clamp, getNiceMax, smoothSeries } from "../utils/chart";
import { parseDate } from "../utils/date";
import { formatAxisTime, formatLatency, formatNumber, formatPercent, formatSourceList, formatTooltipRange } from "../utils/format";

export function HourlyTrendsPanel({
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
            <div
              className="trend-chart"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
            >
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
                    <div
                      className="trend-point success"
                      style={{ left: `${activeX}%`, top: `${activePoint.successY}%` }}
                    />
                    <div
                      className="trend-point failure"
                      style={{ left: `${activeX}%`, top: `${activePoint.failureY}%` }}
                    />
                    <div
                      className="trend-point latency"
                      style={{ left: `${activeX}%`, top: `${activePoint.latencyY}%` }}
                    />
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
