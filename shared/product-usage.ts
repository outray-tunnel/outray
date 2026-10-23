/** Permanent usage is operational accounting, not billing or customer telemetry. */
export const usageMetricDefinitions = [
  {
    "key": "tunnels.opens.http",
    "product": "tunnels",
    "label": "HTTP tunnel openings",
    "unit": "count"
  },
  {
    "key": "tunnels.opens.tcp",
    "product": "tunnels",
    "label": "TCP tunnel openings",
    "unit": "count"
  },
  {
    "key": "tunnels.opens.udp",
    "product": "tunnels",
    "label": "UDP tunnel openings",
    "unit": "count"
  },
  {
    "key": "tunnels.registrations.http",
    "product": "tunnels",
    "label": "HTTP registrations",
    "unit": "count"
  },
  {
    "key": "tunnels.registrations.tcp",
    "product": "tunnels",
    "label": "TCP registrations",
    "unit": "count"
  },
  {
    "key": "tunnels.registrations.udp",
    "product": "tunnels",
    "label": "UDP registrations",
    "unit": "count"
  },
  {
    "key": "tunnels.http_requests",
    "product": "tunnels",
    "label": "Recorded HTTP requests",
    "unit": "count"
  },
  {
    "key": "tunnels.tcp_connections",
    "product": "tunnels",
    "label": "TCP connections",
    "unit": "count"
  },
  {
    "key": "tunnels.udp_datagrams.in",
    "product": "tunnels",
    "label": "Inbound UDP datagrams",
    "unit": "count"
  },
  {
    "key": "tunnels.udp_datagrams.out",
    "product": "tunnels",
    "label": "Outbound UDP datagrams",
    "unit": "count"
  },
  {
    "key": "tunnels.bytes.http.in",
    "product": "tunnels",
    "label": "HTTP bytes in",
    "unit": "bytes"
  },
  {
    "key": "tunnels.bytes.http.out",
    "product": "tunnels",
    "label": "HTTP bytes out",
    "unit": "bytes"
  },
  {
    "key": "tunnels.bytes.tcp.in",
    "product": "tunnels",
    "label": "TCP bytes in",
    "unit": "bytes"
  },
  {
    "key": "tunnels.bytes.tcp.out",
    "product": "tunnels",
    "label": "TCP bytes out",
    "unit": "bytes"
  },
  {
    "key": "tunnels.bytes.udp.in",
    "product": "tunnels",
    "label": "UDP bytes in",
    "unit": "bytes"
  },
  {
    "key": "tunnels.bytes.udp.out",
    "product": "tunnels",
    "label": "UDP bytes out",
    "unit": "bytes"
  },
  {
    "key": "secrets.added",
    "product": "secrets",
    "label": "Secret entries added",
    "unit": "count"
  },
  {
    "key": "secrets.read_operations",
    "product": "secrets",
    "label": "Successful secret read operations",
    "unit": "count"
  },
  {
    "key": "secrets.values_read",
    "product": "secrets",
    "label": "Secret values read",
    "unit": "count"
  },
  {
    "key": "secrets.operations.success",
    "product": "secrets",
    "label": "Secrets operations: success",
    "unit": "count"
  },
  {
    "key": "secrets.operations.failure",
    "product": "secrets",
    "label": "Secrets operations: failure",
    "unit": "count"
  },
  {
    "key": "secrets.operations.denied",
    "product": "secrets",
    "label": "Secrets operations: denied",
    "unit": "count"
  },
  {
    "key": "observability.telemetry_bytes",
    "product": "observability",
    "label": "Accepted telemetry bytes",
    "unit": "bytes"
  },
  {
    "key": "observability.spans",
    "product": "observability",
    "label": "Accepted spans",
    "unit": "count"
  },
  {
    "key": "observability.logs",
    "product": "observability",
    "label": "Accepted logs",
    "unit": "count"
  },
  {
    "key": "observability.metric_points",
    "product": "observability",
    "label": "Accepted metric points",
    "unit": "count"
  },
  {
    "key": "observability.evaluations.success",
    "product": "observability",
    "label": "Alert evaluations: success",
    "unit": "count"
  },
  {
    "key": "observability.evaluations.no_data",
    "product": "observability",
    "label": "Alert evaluations: no_data",
    "unit": "count"
  },
  {
    "key": "observability.evaluations.error",
    "product": "observability",
    "label": "Alert evaluations: error",
    "unit": "count"
  },
  {
    "key": "uptime.checks.success",
    "product": "uptime",
    "label": "Uptime checks: success",
    "unit": "count"
  },
  {
    "key": "uptime.checks.failure",
    "product": "uptime",
    "label": "Uptime checks: failure",
    "unit": "count"
  },
  {
    "key": "uptime.status_views",
    "product": "uptime",
    "label": "Accepted status-page views",
    "unit": "count"
  },
  {
    "key": "agent.runs_started",
    "product": "agent",
    "label": "Agent runs started",
    "unit": "count"
  },
  {
    "key": "agent.runs.complete",
    "product": "agent",
    "label": "Agent runs: complete",
    "unit": "count"
  },
  {
    "key": "agent.runs.failed",
    "product": "agent",
    "label": "Agent runs: failed",
    "unit": "count"
  },
  {
    "key": "agent.runs.cancelled",
    "product": "agent",
    "label": "Agent runs: cancelled",
    "unit": "count"
  },
  {
    "key": "agent.input_tokens",
    "product": "agent",
    "label": "Agent input tokens",
    "unit": "count"
  },
  {
    "key": "agent.output_tokens",
    "product": "agent",
    "label": "Agent output tokens",
    "unit": "count"
  }
] as const;
export type UsageMetric = typeof usageMetricDefinitions[number]["key"];
export type UsageProduct = typeof usageMetricDefinitions[number]["product"];
export const usageProducts = ["tunnels", "secrets", "observability", "uptime", "agent"] as const;
export interface UsageDatabase { query(text: string, values?: any[]): Promise<any> }
export interface UsageEvent {
  organizationId: string;
  source: string;
  id: string;
  timestamp: string;
  deltas: Partial<Record<UsageMetric, string | number>>;
}
const knownMetrics = new Set<string>(usageMetricDefinitions.map(metric => metric.key));
/** The caller owns the transaction; the SQL function atomically deduplicates and
 * records both organization and anonymous platform totals. */
export async function recordProductUsage(database: UsageDatabase, event: UsageEvent): Promise<boolean> {
  if (!event.organizationId || event.organizationId.length > 128 || !/^[a-z][a-z0-9-]{0,63}$/.test(event.source) || !event.id || event.id.length > 256 || !Number.isFinite(Date.parse(event.timestamp))) throw new Error("Invalid usage event");
  const deltas: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.deltas).sort(([a], [b]) => a.localeCompare(b))) {
    if (!knownMetrics.has(key) || (typeof value === "number" && !Number.isSafeInteger(value)) || !/^\d+$/.test(String(value))) throw new Error("Invalid usage delta");
    const count = BigInt(value!);
    if (count > 9223372036854775807n) throw new Error("Usage delta overflow");
    if (count > 0n) deltas[key] = String(count);
  }
  if (!Object.keys(deltas).length) return false;
  const result = await database.query("SELECT record_product_usage($1,$2,$3,$4::timestamptz,$5::jsonb) AS recorded", [event.organizationId, event.source, event.id, event.timestamp, JSON.stringify(deltas)]);
  return result.rows[0]?.recorded === true;
}
export interface UsageAggregateMetric {
  key: UsageMetric; product: UsageProduct; label: string; unit: "count" | "bytes";
  lifetime: string; period: string; historicalBaseline: string;
}
export interface UsageAggregateReport {
  generatedAt: string; range: "7d" | "30d" | "90d" | "365d" | "all";
  organizationId: string | null; interval: "day" | "month";
  metrics: UsageAggregateMetric[];
  points: Array<{ date: string; values: Partial<Record<UsageMetric, string>> }>;
  coverage: Array<{ source: string; collectionStartedAt: string | null; lastProcessedAt: string | null; backfill: string; earliestBackfillAt: string | null; historicalComplete: false }>;
  pending: { statusViews: string; oldestStatusViewAt: string | null; failedStatusViews: string };
}
export default { usageMetricDefinitions, usageProducts, recordProductUsage };
