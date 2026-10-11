/** Telemetry uses calendar months in UTC, even for annual subscriptions. */
export const TELEMETRY_USAGE_METRIC = "telemetry_bytes";

export function telemetryUsagePeriod(now: Date = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid usage time");
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  return {
    month: `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`,
    startsAt: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
    resetsAt: new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString(),
  };
}

export default { TELEMETRY_USAGE_METRIC, telemetryUsagePeriod };
