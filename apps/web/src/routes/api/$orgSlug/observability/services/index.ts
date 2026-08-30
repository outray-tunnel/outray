import { createFileRoute } from "@tanstack/react-router";
import { requireOrgFromSlug } from "@/lib/org";
import { queryTinybird } from "@/lib/tinybird";

interface ServiceCatalogRow {
  id: string;
  name: string;
  namespace: string;
  version: string;
  environment: string;
  region: string;
  scope_name: string;
  last_seen: string;
  operation_count: number;
  error_count: number;
  error_rate: number;
  p95_duration_ms: number;
  operations_per_minute: number;
  uses_server_spans: number | boolean;
  health: "healthy" | "degraded" | "critical";
  total_service_count: number;
  total_operation_count: number;
  total_error_count: number;
  total_operations_per_minute: number;
  total_attention_count: number;
}

interface ServiceTrafficRow {
  timestamp: string;
  operation_count: number;
  error_count: number;
  error_rate: number;
  p95_duration_ms: number;
  operations_per_minute: number;
}

interface ServiceTrafficPoint {
  timestamp: string;
  operationCount: number;
  errorCount: number;
  errorRate: number;
  p95Duration: number | null;
  operationsPerMinute: number;
}

const RANGE_HOURS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 168,
  "30d": 720,
};

const RANGE_INTERVAL_SECONDS: Record<string, number> = {
  "1h": 300,
  "6h": 900,
  "24h": 3600,
  "7d": 21600,
  "30d": 86400,
};

export const Route = createFileRoute("/api/$orgSlug/observability/services/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;

        const url = new URL(request.url);
        const requestedRange = url.searchParams.get("range") || "24h";
        const range = RANGE_HOURS[requestedRange] ? requestedRange : "24h";
        const hours = RANGE_HOURS[range];
        const service = url.searchParams.get("service")?.trim() || undefined;
        const organizationId = orgResult.organization.id;

        try {
          const [catalog, traffic] = await Promise.all([
            queryTinybird<ServiceCatalogRow>("service_catalog", {
              organization_id: organizationId,
              hours,
              service,
              limit: 250,
            }),
            queryTinybird<ServiceTrafficRow>("service_traffic", {
              organization_id: organizationId,
              hours,
              service,
              interval_seconds: RANGE_INTERVAL_SECONDS[range],
            }),
          ]);

          const services = catalog.map((row) => ({
            id: row.id,
            name: row.name || "unknown-service",
            namespace: row.namespace,
            version: row.version,
            environment: row.environment,
            region: row.region,
            scopeName: row.scope_name,
            lastSeen: row.last_seen,
            operationCount: Number(row.operation_count),
            errorCount: Number(row.error_count),
            errorRate: Number(row.error_rate),
            p95Duration: Number(row.p95_duration_ms),
            operationsPerMinute: Number(row.operations_per_minute),
            usesServerSpans: Boolean(Number(row.uses_server_spans)),
            health: row.health,
          }));
          const totals = catalog[0];
          const totalOperations = Number(totals?.total_operation_count || 0);
          const totalErrors = Number(totals?.total_error_count || 0);
          const intervalSeconds = RANGE_INTERVAL_SECONDS[range];

          return Response.json({
            services,
            traffic: completeTrafficBuckets(traffic, hours, intervalSeconds),
            summary: {
              serviceCount: Number(totals?.total_service_count || 0),
              totalOperations,
              totalErrors,
              errorRate:
                totalOperations === 0
                  ? 0
                  : Number(((totalErrors / totalOperations) * 100).toFixed(2)),
              operationsPerMinute: Number(
                totals?.total_operations_per_minute || 0,
              ),
              attentionCount: Number(totals?.total_attention_count || 0),
            },
            range,
          });
        } catch (error) {
          console.error("Failed to query observability services", error);
          return Response.json(
            { error: "Service telemetry is temporarily unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});

function completeTrafficBuckets(
  rows: ServiceTrafficRow[],
  hours: number,
  intervalSeconds: number,
): ServiceTrafficPoint[] {
  const intervalMilliseconds = intervalSeconds * 1_000;
  const now = Date.now();
  const rangeStart = now - hours * 60 * 60 * 1_000;
  const firstCompleteBucket =
    Math.ceil(rangeStart / intervalMilliseconds) * intervalMilliseconds;
  const currentBucket =
    Math.floor(now / intervalMilliseconds) * intervalMilliseconds;
  const rowsByBucket = new Map<number, ServiceTrafficRow>();

  for (const row of rows) {
    const timestamp = parseTinybirdTimestamp(row.timestamp);
    if (timestamp === null) continue;
    const bucket =
      Math.floor(timestamp / intervalMilliseconds) * intervalMilliseconds;
    rowsByBucket.set(bucket, row);
  }

  const points: ServiceTrafficPoint[] = [];
  for (
    let bucket = firstCompleteBucket;
    bucket < currentBucket;
    bucket += intervalMilliseconds
  ) {
    const row = rowsByBucket.get(bucket);
    points.push(
      row
        ? {
            timestamp: new Date(bucket).toISOString(),
            operationCount: Number(row.operation_count),
            errorCount: Number(row.error_count),
            errorRate: Number(row.error_rate),
            p95Duration: Number(row.p95_duration_ms),
            operationsPerMinute: Number(row.operations_per_minute),
          }
        : {
            timestamp: new Date(bucket).toISOString(),
            operationCount: 0,
            errorCount: 0,
            errorRate: 0,
            p95Duration: null,
            operationsPerMinute: 0,
          },
    );
  }

  return points;
}

function parseTinybirdTimestamp(value: string): number | null {
  let timestamp = value.trim().replace(" ", "T");
  timestamp = timestamp.replace(/(\.\d{3})\d+/, "$1");
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp)) timestamp += "Z";
  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}
