import type { UsageNumberConfig } from "../overview/usage-number-format";

export const OBSERVABILITY_RANGES = ["1h", "24h", "7d", "30d"] as const;
export type ObservabilityRange = (typeof OBSERVABILITY_RANGES)[number];
export type ServiceHealth = "healthy" | "degraded" | "critical";
export type ObservabilityMetricKey = "operations" | "errorRate" | "p95";

export interface ServiceSummary {
  id: string;
  name: string;
  namespace?: string;
  version?: string;
  environment: string;
  region: string;
  scopeName?: string;
  lastSeen?: string;
  operationCount: number;
  errorCount?: number;
  errorRate: number;
  p95Duration: number;
  operationsPerMinute: number;
  usesServerSpans: boolean;
  health: ServiceHealth;
}

export interface ServiceTrafficPoint {
  timestamp: string;
  operationCount: number;
  errorCount?: number;
  errorRate: number;
  p95Duration: number | null;
  operationsPerMinute: number;
}

export interface ServiceOverviewResponse {
  services: ServiceSummary[];
  traffic: ServiceTrafficPoint[];
  summary: {
    serviceCount: number;
    totalOperations: number;
    totalErrors: number;
    errorRate: number;
    operationsPerMinute: number;
    attentionCount: number;
  };
  range: string;
}

/** Null means no observed evidence; zero is an actual recorded value. */
export interface ObservabilityUsageBar {
  startTime: string;
  endTime: string;
  value: number | null;
}

export type ObservabilityUsage = Record<
  ObservabilityMetricKey,
  ObservabilityUsageBar[]
>;

const rangeMilliseconds: Record<ObservabilityRange, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

// Match the services API's completed traffic buckets, not the tunnel API's.
const intervalMilliseconds: Record<ObservabilityRange, number> = {
  "1h": 300_000,
  "24h": 3_600_000,
  "7d": 21_600_000,
  "30d": 86_400_000,
};

export function normalizeObservabilityRange(value: unknown): ObservabilityRange {
  return OBSERVABILITY_RANGES.find((range) => range === value) ?? "24h";
}

function nonnegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function observedP95(point: ServiceTrafficPoint): number | null {
  return point.operationCount > 0 &&
    point.p95Duration !== null &&
    Number.isFinite(point.p95Duration) &&
    point.p95Duration >= 0
    ? point.p95Duration
    : null;
}

/** Keep only received, aligned, fully completed intervals in this range. */
function completedTraffic(
  data: Pick<ServiceOverviewResponse, "traffic" | "range">,
  referenceTime: number,
): ServiceTrafficPoint[] {
  if (!Number.isFinite(referenceTime)) return [];
  const range = normalizeObservabilityRange(data.range);
  const interval = intervalMilliseconds[range];
  const start = Math.ceil((referenceTime - rangeMilliseconds[range]) / interval) * interval;
  const end = Math.floor(referenceTime / interval) * interval;
  const points = new Map<number, ServiceTrafficPoint>();
  for (const point of data.traffic) {
    const time = Date.parse(point.timestamp);
    if (!Number.isFinite(time) || time % interval !== 0 || time < start || time >= end)
      continue;
    points.set(time, point);
  }
  return [...points.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point);
}

/**
 * Reduce complete API intervals to the compact 14-bar display. Operation counts
 * sum; error rates use operation-weighted counts; percentiles never average.
 */
export function buildObservabilityUsage(
  data: Pick<ServiceOverviewResponse, "traffic" | "range">,
  referenceTime = Date.now(),
  maximumBars = 14,
): ObservabilityUsage {
  const usage: ObservabilityUsage = { operations: [], errorRate: [], p95: [] };
  if (!Number.isInteger(maximumBars) || maximumBars < 1) return usage;
  const points = completedTraffic(data, referenceTime);
  const count = Math.min(maximumBars, points.length);
  const interval = intervalMilliseconds[normalizeObservabilityRange(data.range)];

  for (let index = 0; index < count; index++) {
    const from = Math.floor((index * points.length) / count);
    const to = Math.floor(((index + 1) * points.length) / count);
    const group = points.slice(from, to);
    const bounds = {
      startTime: new Date(group[0].timestamp).toISOString(),
      endTime: new Date(Date.parse(group.at(-1)!.timestamp) + interval).toISOString(),
    };
    let operations = 0;
    let errors = 0;
    let latestP95: number | null = null;
    for (const point of group) {
      const pointOperations = nonnegative(point.operationCount);
      operations += pointOperations;
      // Older response shapes omitted errorCount. Weight their reported rate
      // by operations instead of giving empty/light buckets equal influence.
      errors += typeof point.errorCount === "number" && Number.isFinite(point.errorCount)
        ? Math.min(pointOperations, nonnegative(point.errorCount))
        : pointOperations * Math.min(100, nonnegative(point.errorRate)) / 100;
      const latency = observedP95(point);
      if (latency !== null) latestP95 = latency;
    }
    usage.operations.push({ ...bounds, value: operations });
    usage.errorRate.push({ ...bounds, value: operations > 0 ? errors / operations * 100 : null });
    usage.p95.push({ ...bounds, value: latestP95 });
  }
  return usage;
}

/** Latest observed completed bucket, not an average of bucket percentiles. */
export function getLatestP95(
  data: Pick<ServiceOverviewResponse, "traffic" | "range">,
  referenceTime = Date.now(),
): number | null {
  for (const point of completedTraffic(data, referenceTime).reverse()) {
    const latency = observedP95(point);
    if (latency !== null) return latency;
  }
  return null;
}

export function getObservabilityNumberConfig(
  value: number,
  metric: ObservabilityMetricKey,
): UsageNumberConfig {
  const safeValue = nonnegative(value);
  if (metric === "operations") {
    return { value: safeValue, suffix: "", format: { maximumFractionDigits: 0 } };
  }
  if (metric === "errorRate") {
    return { value: safeValue, suffix: "%", format: { maximumFractionDigits: 2 } };
  }
  const seconds = safeValue >= 1_000;
  const duration = seconds ? safeValue / 1_000 : safeValue;
  return {
    value: duration,
    suffix: seconds ? "s" : "ms",
    format: { maximumFractionDigits: !seconds && duration >= 100 ? 0 : 2 },
  };
}

function formatMetric(value: number | null, metric: ObservabilityMetricKey): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const config = getObservabilityNumberConfig(value, metric);
  return `${new Intl.NumberFormat("en-US", config.format).format(config.value)}${config.suffix}`;
}

export const formatCount = (value: number | null) => formatMetric(value, "operations");
export const formatErrorRate = (value: number | null) => formatMetric(value, "errorRate");
export const formatDuration = (value: number | null) => formatMetric(value, "p95");
