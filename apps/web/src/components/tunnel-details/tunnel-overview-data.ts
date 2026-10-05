import type { UsageMetricBar } from "../overview/usage-metric-card";
import type { UsageNumberConfig } from "../overview/usage-number-format";
import type { OverviewChartPoint, OverviewMetric } from "./tunnel-overview-ui";

const bucketMilliseconds: Record<string, number> = {
  "1h": 60_000,
  "24h": 3_600_000,
  "7d": 86_400_000,
  "30d": 86_400_000,
};

/** A missing measurement is not an observed zero. */
export function finiteTunnelMetricValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function parseBucketTime(value: string): number {
  // PostgreSQL may return timestamp text without an offset; buckets are UTC.
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  return Date.parse(normalized);
}

/** Keep API buckets intact: rates and distinct clients cannot be summed. */
export function buildTunnelMetricBars(
  points: readonly OverviewChartPoint[],
  chartKey: OverviewMetric["chartKey"],
  range: string,
): UsageMetricBar[] {
  const bucketWidth = bucketMilliseconds[range];
  if (!bucketWidth) return [];

  return points
    .map((point) => ({ point, start: parseBucketTime(point.time) }))
    .filter(({ start }) => Number.isFinite(start) && Number.isFinite(new Date(start + bucketWidth).getTime()))
    .sort((a, b) => a.start - b.start)
    .map(({ point, start }) => {
      let value = finiteTunnelMetricValue(point[chartKey]);
      if (chartKey === "duration" || chartKey === "errorRate") {
        const requests = finiteTunnelMetricValue(point.requests);
        if (requests === null || requests === 0) value = null;
      }
      if (chartKey === "avgDurationMs") {
        // Legacy APIs omit closes and emit 0 for an unavailable average.
        const closes = finiteTunnelMetricValue(point.closes);
        if (value === 0 || (point.closes !== undefined && (closes === null || closes === 0))) {
          value = null;
        }
      }
      return {
        startTime: new Date(start).toISOString(),
        endTime: new Date(start + bucketWidth).toISOString(),
        value,
      };
    });
}

export function formatTunnelCount(value: number): string {
  return Math.round(value).toLocaleString();
}

/** NumberFlow's scaled value and suffix match the static tunnel formatters. */
export function getTunnelMetricNumberConfig(
  value: number,
  kind: "count" | "bytes" | "duration" | "percent",
): UsageNumberConfig {
  const safeValue = finiteTunnelMetricValue(value) ?? 0;
  if (kind === "count") {
    return { value: Math.round(safeValue), suffix: "", format: { maximumFractionDigits: 0 } };
  }

  if (kind === "percent") {
    const digits = safeValue >= 10 ? 1 : 2;
    return {
      value: Number(safeValue.toFixed(digits)),
      suffix: "%",
      format: { useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits },
    };
  }

  const units = kind === "bytes"
    ? [
        { minimum: 1_073_741_824, suffix: " GB" },
        { minimum: 1_048_576, suffix: " MB" },
        { minimum: 1_024, suffix: " KB" },
      ]
    : [
        { minimum: 60_000, suffix: " min" },
        { minimum: 1_000, suffix: " s" },
      ];
  const unit = units.find(({ minimum }) => safeValue >= minimum);
  if (!unit) {
    return {
      value: Math.round(safeValue),
      suffix: kind === "bytes" ? " B" : " ms",
      format: { useGrouping: false, maximumFractionDigits: 0 },
    };
  }
  return {
    value: Number((safeValue / unit.minimum).toFixed(1)),
    suffix: unit.suffix,
    format: { useGrouping: false, minimumFractionDigits: 1, maximumFractionDigits: 1 },
  };
}
