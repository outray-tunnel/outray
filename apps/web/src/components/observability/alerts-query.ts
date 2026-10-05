import { queryOptions } from "@tanstack/react-query";
import { ALERT_STATES, signalOptions, type AlertsResponse, type AlertsSnapshot } from "./alerts-data";

export function observabilityAlertsQuery(orgSlug: string) {
  return queryOptions({
    queryKey: ["observability", "alerts", orgSlug] as const,
    queryFn: async ({ signal }): Promise<AlertsSnapshot> => {
      const response = await fetch(`/api/${encodeURIComponent(orgSlug)}/observability/alerts`, { signal });
      if (!response.ok) throw new Error("Alert rules are temporarily unavailable.");
      let data: AlertsResponse;
      try { data = await response.json() as AlertsResponse; }
      catch (error) {
        if (signal.aborted || error instanceof DOMException && error.name === "AbortError") throw new DOMException("Aborted", "AbortError");
        throw new Error("Alert rules are temporarily unavailable.");
      }
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (!data || !Array.isArray(data.alerts) || !data.alerts.every(isAlertRecord) || !data.summary ||
        !["total", "firing", "healthy", "pending", "error", "muted", "noData"].every((key) => typeof (data.summary as unknown as Record<string, unknown>)[key] === "number") ||
        !Array.isArray(data.services) || !data.services.every((value) => typeof value === "string" || value && typeof value.name === "string") ||
        !data.integrationAvailability || typeof data.integrationAvailability.slack !== "boolean" || typeof data.integrationAvailability.discord !== "boolean") {
        throw new Error("Alert rules are temporarily unavailable.");
      }
      return { ...data, receivedAt: Date.now() };
    },
    enabled: !!orgSlug,
    retry: false,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

function isAlertRecord(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const alert = value as Record<string, unknown>;
  return ["id", "name", "service"].every((key) => typeof alert[key] === "string") &&
    typeof alert.enabled === "boolean" && ALERT_STATES.includes(alert.state as never) &&
    signalOptions.some((item) => item.value === alert.signal) &&
    ["gt", "gte", "lt", "lte"].includes(alert.operator as string) &&
    typeof alert.threshold === "number" && typeof alert.windowMinutes === "number" &&
    (alert.currentValue === null || typeof alert.currentValue === "number") &&
    (alert.lastEvaluatedAt === null || typeof alert.lastEvaluatedAt === "string");
}
