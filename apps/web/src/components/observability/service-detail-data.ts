import type { UsageMetricBar } from "../overview/usage-metric-card";
import type { UsageNumberConfig } from "../overview/usage-number-format";
import { getObservabilityNumberConfig, type ServiceOverviewResponse, type ServiceTrafficPoint } from "./overview-data";
import { parseServiceLastSeen, type ServiceInventoryItem } from "./services-data";

export const SERVICE_DETAIL_RANGES = ["1h", "6h", "24h", "7d", "30d"] as const;
export type ServiceDetailRange = (typeof SERVICE_DETAIL_RANGES)[number];
export type ServiceDetailMetricKey = "operations" | "throughput" | "errorRate" | "p95";

export interface ServiceDetailService extends ServiceInventoryItem {
  scopeName: string;
}

export interface ServiceDetailResponse {
  services: ServiceDetailService[];
  traffic: ServiceTrafficPoint[];
  summary?: ServiceOverviewResponse["summary"];
  range: string;
}

export interface ServiceDetailSnapshot extends ServiceDetailResponse {
  receivedAt: number;
}

export type ServiceDetailUsage = Record<ServiceDetailMetricKey, UsageMetricBar[]>;

const rangeMilliseconds: Record<ServiceDetailRange, number> = {
  "1h": 3_600_000, "6h": 21_600_000, "24h": 86_400_000,
  "7d": 604_800_000, "30d": 2_592_000_000,
};
// Match RANGE_INTERVAL_SECONDS in the services API, including its 6h option.
const intervalMilliseconds: Record<ServiceDetailRange, number> = {
  "1h": 300_000, "6h": 900_000, "24h": 3_600_000,
  "7d": 21_600_000, "30d": 86_400_000,
};

export function normalizeServiceDetailRange(value: unknown): ServiceDetailRange {
  return SERVICE_DETAIL_RANGES.find((range) => range === value) ?? "24h";
}

function measuredNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function observedLatency(point: ServiceTrafficPoint): number | null {
  const operations = measuredNumber(point.operationCount);
  return operations !== null && operations > 0 ? measuredNumber(point.p95Duration) : null;
}

function observedErrors(point: ServiceTrafficPoint, operations: number): number | null {
  if (operations === 0) return 0;
  if (point.errorCount !== undefined) {
    const errors = measuredNumber(point.errorCount);
    return errors === null ? null : Math.min(operations, errors);
  }
  // Preserve older responses without errorCount using an operation-weighted rate.
  const rate = measuredNumber(point.errorRate);
  return rate === null ? null : operations * Math.min(100, rate) / 100;
}

/** Only received, aligned, complete API intervals; no manufactured gap buckets. */
function completedTraffic(data: Pick<ServiceDetailResponse, "traffic" | "range">, referenceTime: number) {
  if (!Number.isFinite(referenceTime)) return [];
  const range = normalizeServiceDetailRange(data.range);
  const interval = intervalMilliseconds[range];
  const start = Math.ceil((referenceTime - rangeMilliseconds[range]) / interval) * interval;
  const end = Math.floor(referenceTime / interval) * interval;
  const points = new Map<number, ServiceTrafficPoint>();
  for (const point of data.traffic) {
    const time = parseServiceLastSeen(point.timestamp);
    if (!Number.isFinite(time) || time % interval !== 0 || time < start || time >= end) continue;
    points.set(time, point);
  }
  return [...points.entries()].sort(([left], [right]) => left - right);
}

/** Counts sum, error rates are weighted, and grouped percentiles never average. */
export function buildServiceDetailUsage(
  data: Pick<ServiceDetailResponse, "traffic" | "range">,
  referenceTime: number,
  maximumBars = 14,
): ServiceDetailUsage {
  const usage: ServiceDetailUsage = { operations: [], throughput: [], errorRate: [], p95: [] };
  if (!Number.isInteger(maximumBars) || maximumBars < 1) return usage;
  const points = completedTraffic(data, referenceTime);
  const count = Math.min(maximumBars, points.length);
  const interval = intervalMilliseconds[normalizeServiceDetailRange(data.range)];
  for (let index = 0; index < count; index++) {
    const from = Math.floor(index * points.length / count);
    const to = Math.floor((index + 1) * points.length / count);
    const group = points.slice(from, to);
    const start = group[0][0];
    const end = group.at(-1)![0] + interval;
    const bounds = { startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() };
    let operations = 0;
    let errors = 0;
    // Explicit API zero buckets are evidence; absent intervals are not zeroes.
    const contiguous = end - start === group.length * interval;
    let operationsKnown = contiguous;
    let errorsKnown = contiguous;
    let latestLatency: number | null = null;
    for (const [, point] of group) {
      const pointOperations = measuredNumber(point.operationCount);
      if (pointOperations === null) {
        operationsKnown = false;
        errorsKnown = false;
      } else {
        operations += pointOperations;
        const pointErrors = observedErrors(point, pointOperations);
        if (pointErrors === null) errorsKnown = false;
        else errors += pointErrors;
      }
      const latency = observedLatency(point);
      if (latency !== null) latestLatency = latency;
    }
    usage.operations.push({ ...bounds, value: operationsKnown ? operations : null });
    // Include real zero buckets, rather than averaging rounded API rates.
    usage.throughput.push({ ...bounds, value: operationsKnown ? operations / ((end - start) / 60_000) : null });
    usage.errorRate.push({ ...bounds, value: operationsKnown && errorsKnown && operations > 0 ? errors / operations * 100 : null });
    // This is the latest observed interval's P95, not a whole-group quantile.
    usage.p95.push({ ...bounds, value: latestLatency });
  }
  return usage;
}

export function getServiceDetailNumberConfig(value: number, key: ServiceDetailMetricKey): UsageNumberConfig {
  if (key !== "throughput") return getObservabilityNumberConfig(value, key);
  return {
    value: measuredNumber(value) ?? 0,
    suffix: " /min",
    format: { maximumFractionDigits: 2 },
  };
}

function formatMetric(value: number | null | undefined, key: ServiceDetailMetricKey): string {
  const measured = measuredNumber(value);
  if (measured === null) return "—";
  const config = getServiceDetailNumberConfig(measured, key);
  return `${new Intl.NumberFormat("en-US", config.format).format(config.value)}${config.suffix}`;
}

export const formatServiceDetailCount = (value: number | null | undefined) => formatMetric(value, "operations");
export const formatServiceDetailRate = (value: number | null | undefined) => formatMetric(value, "errorRate");
export const formatServiceDetailDuration = (value: number | null | undefined) => formatMetric(value, "p95");
export const formatServiceDetailThroughput = (value: number | null | undefined) => formatMetric(value, "throughput");
