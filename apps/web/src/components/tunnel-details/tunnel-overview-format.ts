export const OVERVIEW_RANGES = ["1h", "24h", "7d", "30d"] as const;

export function selectOverviewMetric<T extends { id: string }>(
  metrics: readonly T[],
  selectedId: string | undefined,
): T | undefined {
  return metrics.find((metric) => metric.id === selectedId) ?? metrics[0];
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

export function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

export function formatChartTime(value: string, range: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return range === "1h" || range === "24h"
    ? date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: range === "1h" ? "2-digit" : undefined,
      })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
