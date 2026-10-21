/** Public report contract; no visitor identifiers are ever returned to the console. */
export const STATUS_ANALYTICS_RANGES = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 } as const;
export type StatusAnalyticsRange = keyof typeof STATUS_ANALYTICS_RANGES;
export interface StatusAnalyticsRow { kind: "summary" | "time" | "referrer" | "country" | "page"; label: string; views: number; visitors: number; }
export interface StatusAnalyticsReport {
  available: true;
  range: StatusAnalyticsRange;
  retentionDays: number;
  start: string;
  end: string;
  views: number;
  visitors: number;
  series: Array<{ time: string; views: number; visitors: number }>;
  referrers: Array<{ label: string; views: number }>;
  countries: Array<{ label: string; views: number }>;
  pages: Array<{ label: string; views: number }>;
}

export function statusAnalyticsWindow(range: StatusAnalyticsRange, retentionDays: number, now = Date.now()) {
  const days = Math.min(STATUS_ANALYTICS_RANGES[range], Math.max(1, Math.min(90, retentionDays)));
  const bucketSeconds = days <= 1 ? 3600 : 86400;
  const start = now - days * 86400_000;
  return { start, end: now, bucketSeconds };
}

// Shared by bundled apps and the repository's CommonJS tsx consumers.
export default { STATUS_ANALYTICS_RANGES, statusAnalyticsWindow };
