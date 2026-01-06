import type { BucketPoint } from "../types";
import { parseDate } from "./date";

export const getAxisLabels = (
  buckets: BucketPoint[],
  labelCount = 7,
  intervalMinutes?: number,
  useBucketEnd?: boolean
) => {
  if (!buckets.length) {
    return [];
  }
  const safeCount = Math.max(2, Math.min(labelCount, buckets.length));
  const lastIndex = buckets.length - 1;
  if (buckets.length <= safeCount) {
    return buckets.map((bucket) => {
      const labelDate = parseDate(bucket.bucketStart);
      if (!labelDate) {
        return "--:--";
      }
      const resolved = useBucketEnd && intervalMinutes
        ? new Date(labelDate.getTime() + intervalMinutes * 60 * 1000)
        : labelDate;
      const hours = String(resolved.getHours()).padStart(2, "0");
      const minutes = String(resolved.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    });
  }
  const positionSet = new Set<number>();
  for (let index = 0; index < safeCount; index += 1) {
    positionSet.add(Math.round((lastIndex * index) / (safeCount - 1)));
  }
  return Array.from(positionSet)
    .sort((left, right) => left - right)
    .map((index) => {
      const labelDate = parseDate(buckets[index]?.bucketStart);
      if (!labelDate) {
        return "--:--";
      }
      const resolved = useBucketEnd && intervalMinutes
        ? new Date(labelDate.getTime() + intervalMinutes * 60 * 1000)
        : labelDate;
      const hours = String(resolved.getHours()).padStart(2, "0");
      const minutes = String(resolved.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    });
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const smoothSeries = (values: number[], windowSize = 3) => {
  if (values.length <= 2 || windowSize <= 1) {
    return values;
  }
  const radius = Math.floor(windowSize / 2);
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    let sum = 0;
    let count = 0;
    for (let i = start; i <= end; i += 1) {
      sum += values[i];
      count += 1;
    }
    return count > 0 ? sum / count : values[index];
  });
};

export const getNiceMax = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / magnitude;
  const rounded = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return rounded * magnitude;
};

export const buildLinePath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) {
    return "";
  }
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
};

export const buildLinePathWithGaps = (
  points: Array<{ x: number; y: number }>,
  visible: boolean[]
) => {
  let path = "";
  let started = false;
  points.forEach((point, index) => {
    if (!visible[index]) {
      started = false;
      return;
    }
    path += `${started ? "L" : "M"}${point.x} ${point.y} `;
    started = true;
  });
  return path.trim();
};

export const buildAreaPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) {
    return "";
  }
  const start = points[0];
  const end = points[points.length - 1];
  return `${buildLinePath(points)} L ${end.x} 100 L ${start.x} 100 Z`;
};
