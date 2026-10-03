export const tunnelStatsRangeConfig = {
  "1h": { milliseconds: 60 * 60 * 1000, bucket: "1 minute" },
  "24h": { milliseconds: 24 * 60 * 60 * 1000, bucket: "1 hour" },
  "7d": { milliseconds: 7 * 24 * 60 * 60 * 1000, bucket: "1 day" },
  "30d": { milliseconds: 30 * 24 * 60 * 60 * 1000, bucket: "1 day" },
} as const;

export type TunnelStatsRange = keyof typeof tunnelStatsRangeConfig;

export function parseTunnelStatsRange(value: string | null): TunnelStatsRange | null {
  if (value === null) return "24h";
  return Object.hasOwn(tunnelStatsRangeConfig, value)
    ? value as TunnelStatsRange
    : null;
}

export function tunnelStatsWindow(range: TunnelStatsRange, now = new Date()) {
  const end = new Date(now);
  const start = new Date(end.getTime() - tunnelStatsRangeConfig[range].milliseconds);
  return { start, end, bucket: tunnelStatsRangeConfig[range].bucket };
}
