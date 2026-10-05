import { parseServiceLastSeen } from "./services-data";

export const METRICS_RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
export type MetricsRange = (typeof METRICS_RANGES)[number];

export interface MetricsSearch {
  metric?: string;
  service?: string;
  range: MetricsRange;
}

export interface MetricMetadata {
  key: string;
  name: string;
  description: string;
  unit: string;
  type: string;
  aggregationTemporality: string;
  isMonotonic: boolean;
  firstSeen: string;
  lastSeen: string;
  dataPointCount: number;
  serviceCount: number;
  services?: string[];
  dimensions: string[];
}

export interface MetricPoint {
  timestamp: string;
  type: string;
  value: number;
  sampleCount: number;
  aggregation: string;
}

export interface MetricServiceValue {
  service: string;
  type: string;
  value: number;
  sampleCount: number;
  lastSeen: string;
  aggregation: string;
}

export interface MetricsResponse {
  metrics: MetricMetadata[];
  selectedMetric: MetricMetadata | null;
  services: string[];
  points: MetricPoint[];
  breakdown: MetricServiceValue[];
  range: string;
}

/** Explicit provenance lets the UI keep previous evidence without relabeling it. */
export interface MetricsSnapshot extends MetricsResponse {
  receivedAt: number;
  requestedMetricKey?: string;
  requestedService?: string;
  requestedRange: MetricsRange;
}

export function normalizeMetricsSearch(input: unknown = {}): MetricsSearch {
  const values = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const metric = typeof values.metric === "string" ? values.metric.trim() : "";
  const service = typeof values.service === "string" ? values.service.trim() : "";
  const candidate = typeof values.range === "string" ? values.range.trim() : "";
  const range = METRICS_RANGES.find((value) => value === candidate) ?? "1h";
  return {
    ...(metric ? { metric } : {}),
    ...(service && service !== "all" ? { service } : {}),
    range,
  };
}

export function metricsSelectionMatches(snapshot: MetricsSnapshot, search: MetricsSearch): boolean {
  const normalized = normalizeMetricsSearch(search);
  return snapshot.requestedMetricKey === normalized.metric &&
    snapshot.requestedService === normalized.service &&
    snapshot.requestedRange === normalized.range;
}

/** Tinybird returns DateTime64 timestamps in UTC, sometimes without a zone. */
export const parseMetricTimestamp = parseServiceLastSeen;

/** Keep actual observations only. Missing or malformed readings are never zero. */
export function sortedMetricPoints(points: readonly MetricPoint[]): MetricPoint[] {
  return points.filter((point) =>
    typeof point.value === "number" && Number.isFinite(point.value) &&
    typeof point.timestamp === "string" && Number.isFinite(parseMetricTimestamp(point.timestamp)),
  ).sort((left, right) => parseMetricTimestamp(left.timestamp) - parseMetricTimestamp(right.timestamp));
}

export function latestMetricPoint(points: readonly MetricPoint[]): MetricPoint | null {
  return sortedMetricPoints(points).at(-1) ?? null;
}

export const METRIC_BUCKET_MS: Record<MetricsRange, number> = {
  "1h": 60_000, "6h": 300_000, "24h": 900_000,
  "7d": 3_600_000, "30d": 14_400_000,
};

export interface ChartDatum {
  time: number;
  value: number | null;
  pointIndex: number | null;
}

/** Null markers break missing intervals; they are not observations or zeroes. */
export function buildMetricChartSeries(points: readonly MetricPoint[], range: MetricsRange) {
  const observations = sortedMetricPoints(points);
  const aggregation = observations.at(-1)?.aggregation ?? "";
  const data: ChartDatum[] = [];
  const excludedAggregations = new Set<string>();
  for (let index = 0; index < observations.length; index++) {
    const point = observations[index];
    const time = parseMetricTimestamp(point.timestamp);
    const previousTime = data.at(-1)?.time;
    if (previousTime !== undefined && time - previousTime > METRIC_BUCKET_MS[range] * 1.5) {
      data.push({ time: previousTime + METRIC_BUCKET_MS[range], value: null, pointIndex: null });
    }
    const onCurrentScale = point.aggregation === aggregation;
    if (!onCurrentScale) excludedAggregations.add(point.aggregation);
    data.push({ time, value: onCurrentScale ? point.value : null, pointIndex: index });
  }
  return { observations, aggregation, data, excludedAggregations: [...excludedAggregations] };
}

export function metricChartInspectionIndex(
  current: number | null, key: string, pointCount: number,
): number | null | undefined {
  if (pointCount < 1) return undefined;
  if (key === "Escape") return null;
  if (key === "Home") return 0;
  if (key === "End") return pointCount - 1;
  if (key === "ArrowLeft") return Math.max(0, (current ?? pointCount) - 1);
  if (key === "ArrowRight") return Math.min(pointCount - 1, (current ?? -1) + 1);
  return undefined;
}

export function metricChartValueDomain(data: readonly ChartDatum[]): [number, number] {
  const values = data.flatMap((point) => point.value === null || !Number.isFinite(point.value) ? [] : [point.value]);
  if (!values.length) return [-1, 1];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const magnitude = Math.max(Math.abs(low), Math.abs(high));
  if (magnitude === 0) return [-1, 1];
  // Normalize before subtracting so a range spanning extreme finite values
  // cannot overflow. Small measurements retain a proportionate visible scale.
  const padding = Math.max(
    magnitude * ((high / magnitude - low / magnitude) * 0.12),
    magnitude * 0.025,
    Number.MIN_VALUE,
  );
  const lower = low - padding;
  const upper = high + padding;
  return [Number.isFinite(lower) ? lower : low, Number.isFinite(upper) ? upper : high];
}

/** This counts raw received points, not histogram observations or metric values. */
export function metricSampleCount(points: readonly MetricPoint[]): number | null {
  let count = 0;
  for (const point of points) {
    if (!Number.isSafeInteger(point.sampleCount) || point.sampleCount < 0) return null;
    count += point.sampleCount;
    if (!Number.isSafeInteger(count)) return null;
  }
  return count;
}

/** No values are clamped; negative gauges are legitimate observations. */
export function sortedMetricServiceValues(values: readonly MetricServiceValue[]): MetricServiceValue[] {
  return values.filter((item) => typeof item.value === "number" && Number.isFinite(item.value))
    // A count and a mean are not comparable on the same numerical ranking.
    .sort((left, right) => left.service.localeCompare(right.service));
}

export function formatMetricType(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function metricDescriptor(metric: MetricMetadata): string[] {
  return [
    formatMetricType(metric.type),
    metric.unit || "unitless",
    formatMetricType(metric.aggregationTemporality),
    metric.isMonotonic ? "monotonic" : "non-monotonic",
  ].filter(Boolean);
}

export function metricOptionLabel(metric: MetricMetadata, duplicateName = false): string {
  return duplicateName ? `${metric.name} · ${metricDescriptor(metric).join(" · ")}` : metric.name;
}

export function metricOptionDescription(metric: MetricMetadata): string {
  const descriptor = metricDescriptor(metric).join(" · ");
  return metric.description ? `${metric.description} · ${descriptor}` : descriptor;
}

/** A distribution without sum is a count; never label it as latency or bytes. */
export function metricValueUnit(unit: string, aggregation: string): string {
  return aggregation === "count" ? "observations" : unit;
}

export function metricAggregationLabel(aggregation: string): string {
  const labels: Record<string, string> = {
    latest: "Latest value",
    delta_sum: "Delta sum",
    cumulative: "Cumulative value",
    mean: "Mean",
    count: "Observations",
    value: "Value",
  };
  return Object.hasOwn(labels, aggregation) ? labels[aggregation] : (formatMetricType(aggregation) || "Value");
}

export function formatMetricValue(value: number | null | undefined, unit: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  const formatted = value.toLocaleString(undefined, absolute > 0 && absolute < 0.01
    ? { maximumSignificantDigits: 3 }
    : { maximumFractionDigits: 3 });
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatMetricCount(value: number | null | undefined): string {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value.toLocaleString()
    : "—";
}

export function formatMetricChartTime(value: string, range: MetricsRange): string {
  const timestamp = parseMetricTimestamp(value);
  if (!Number.isFinite(timestamp)) return "—";
  const date = new Date(timestamp);
  return range === "7d" || range === "30d"
    ? date.toLocaleDateString([], { month: "short", day: "numeric" })
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatMetricDateTime(value: string): string {
  const timestamp = parseMetricTimestamp(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "—";
}

export function metricTone(type: string): "violet" | "emerald" | "amber" | "rose" {
  if (type === "gauge") return "emerald";
  if (type === "histogram" || type === "exponential_histogram") return "amber";
  if (type === "summary") return "rose";
  return "violet";
}
