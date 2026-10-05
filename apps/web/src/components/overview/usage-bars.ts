import type { TunnelStatsRange } from "@/lib/tunnel-stats-range";

export type UsageMetricKey =
  "httpRequests" | "protocolEvents" | "bandwidth" | "errors";

export interface UsagePoint {
  time: string;
  httpRequests: number;
  protocolEvents: number;
  bandwidth: number;
  errors: number;
}

export interface UsageBar {
  startTime: string;
  endTime: string;
  value: number;
}

export function hoverUsageBarIndex(
  rawIndex: unknown,
  count: number,
): number | null {
  if (!Number.isInteger(count) || count < 1) return null;
  if (typeof rawIndex !== "number" && typeof rawIndex !== "string") return null;
  if (typeof rawIndex === "string" && !rawIndex.trim()) return null;
  const index = Number(rawIndex);
  return Number.isInteger(index) && index >= 0 && index < count ? index : null;
}

export function inspectedUsageBar<Bar extends { value: number | null }>(
  currentBars: readonly Bar[],
  storedBars: readonly Bar[],
  hoverIndex: number | null,
  keyboardIndex: number | null,
): Bar | null {
  if (currentBars !== storedBars) return null;
  const index =
    hoverUsageBarIndex(hoverIndex, currentBars.length) ??
    hoverUsageBarIndex(keyboardIndex, currentBars.length);
  return index === null ? null : currentBars[index];
}

const bucketMilliseconds: Record<TunnelStatsRange, number> = {
  "1h": 60_000,
  "24h": 3_600_000,
  "7d": 86_400_000,
  "30d": 86_400_000,
};

/** Undefined means an unrelated key; null dismisses the inspected interval. */
export function nextUsageBarIndex(
  current: number | null,
  key: string,
  count: number,
): number | null | undefined {
  if (key === "Escape") return null;
  if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(key))
    return undefined;
  if (count < 1) return null;
  const index = current ?? count - 1;
  const next =
    key === "ArrowRight"
      ? index + 1
      : key === "ArrowLeft"
        ? index - 1
        : key === "Home"
          ? 0
          : count - 1;
  return Math.max(0, Math.min(count - 1, next));
}

/** Combine contiguous buckets by summing, never averaging request/byte totals. */
export function createUsageBars(
  points: readonly UsagePoint[],
  metric: UsageMetricKey,
  range: TunnelStatsRange,
  windowStart?: string,
  windowEnd?: string,
  maximumBars = 14,
): UsageBar[] {
  if (!Number.isInteger(maximumBars) || maximumBars < 1) return [];
  const ordered = points
    .filter((point) => Number.isFinite(Date.parse(point.time)))
    .slice()
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const count = Math.min(maximumBars, ordered.length);
  const startBoundary = windowStart ? Date.parse(windowStart) : NaN;
  const endBoundary = windowEnd ? Date.parse(windowEnd) : NaN;

  return Array.from({ length: count }, (_, index) => {
    const from = Math.floor((index * ordered.length) / count);
    const to = Math.floor(((index + 1) * ordered.length) / count);
    const start = Date.parse(ordered[from].time);
    const end = ordered[to]
      ? Date.parse(ordered[to].time)
      : Date.parse(ordered[to - 1].time) + bucketMilliseconds[range];
    return {
      startTime: new Date(
        Number.isFinite(startBoundary) ? Math.max(start, startBoundary) : start,
      ).toISOString(),
      endTime: new Date(
        Number.isFinite(endBoundary) ? Math.min(end, endBoundary) : end,
      ).toISOString(),
      value: ordered.slice(from, to).reduce((total, point) => {
        const value = Number(point[metric]);
        return total + (Number.isFinite(value) ? Math.max(0, value) : 0);
      }, 0),
    };
  });
}

export function formatUsageInterval(
  bar: Pick<UsageBar, "startTime" | "endTime">,
  range: TunnelStatsRange,
): string {
  const start = new Date(bar.startTime);
  // The interval's end is exclusive; a midnight edge belongs to the prior day.
  const last = new Date(new Date(bar.endTime).getTime() - 1);
  const date = (value: Date) =>
    value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (range === "7d" || range === "30d") {
    return start.toDateString() === last.toDateString()
      ? date(start)
      : `${date(start)} – ${date(last)}`;
  }
  const time = (value: Date) =>
    value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const end = new Date(bar.endTime);
  return start.toDateString() === last.toDateString()
    ? `${date(start)}, ${time(start)} – ${time(end)}`
    : `${date(start)}, ${time(start)} – ${date(end)}, ${time(end)}`;
}
