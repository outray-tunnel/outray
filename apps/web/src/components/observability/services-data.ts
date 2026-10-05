export type ServiceInventoryHealth = "healthy" | "degraded" | "critical" | "unknown";

export interface ServiceInventoryItem {
  id: string;
  name: string;
  namespace: string;
  version: string;
  environment: string;
  region: string;
  lastSeen: string;
  operationCount: number;
  errorCount: number;
  errorRate: number;
  p95Duration: number;
  operationsPerMinute: number;
  usesServerSpans: boolean;
  health: Exclude<ServiceInventoryHealth, "unknown">;
}

/** A catalog entry without measured operations is not evidence of health. */
export function serviceDisplayHealth(service: ServiceInventoryItem): ServiceInventoryHealth {
  return Number.isFinite(service.operationCount) && service.operationCount > 0
    ? service.health
    : "unknown";
}

/** Tinybird's unzoned DateTime64 values are UTC, not browser-local dates. */
export function parseServiceLastSeen(value: string): number {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(value.trim());
  if (!match) return NaN;
  const [, date, time, fraction = "", zone = "Z"] = match;
  const base = `${date}T${time}${fraction.slice(0, 4)}`;
  const utc = Date.parse(`${base}Z`);
  // Date.parse can roll impossible dates into the next month. Reject those.
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 19) !== `${date}T${time}`) return NaN;
  const offset = zone.length === 5 ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone.toUpperCase();
  return Date.parse(`${base}${offset}`);
}

const healthPriority: Record<ServiceInventoryHealth, number> = {
  critical: 0,
  degraded: 1,
  healthy: 2,
  unknown: 3,
};

/** Filter and sort a new array without changing the cached inventory. */
export function filterServiceInventory(
  services: readonly ServiceInventoryItem[],
  query: string,
  environment: string,
  health: "all" | ServiceInventoryHealth,
): ServiceInventoryItem[] {
  const search = query.trim().toLowerCase();
  return services
    .filter((service) =>
      (environment === "all" || service.environment === environment) &&
      (health === "all" || serviceDisplayHealth(service) === health) &&
      (!search || [service.name, service.namespace, service.version, service.environment, service.region]
        .some((value) => value.toLowerCase().includes(search))),
    )
    .sort((left, right) =>
      healthPriority[serviceDisplayHealth(left)] - healthPriority[serviceDisplayHealth(right)] ||
      left.name.localeCompare(right.name, "en-US", { sensitivity: "base" }) ||
      left.id.localeCompare(right.id, "en-US"),
    );
}
