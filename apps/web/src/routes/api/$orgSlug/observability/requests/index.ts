import { createFileRoute } from "@tanstack/react-router";
import { requireOrgFromSlug } from "@/lib/org";
import { queryTinybird } from "@/lib/tinybird";

interface HttpRequestRow {
  id: string;
  timestamp: string;
  request_id: string;
  method: string;
  route: string;
  path: string;
  url: string;
  service: string;
  environment: string;
  region: string;
  status_code: number;
  is_error: number | boolean;
  duration_ms: number;
  trace_id: string;
  span_id: string;
  request_size: number;
  response_size: number;
  capture_state: string;
  total_count: number;
  has_more: number | boolean;
}

interface HttpRequestStatsRow {
  total_requests: number;
  error_requests: number;
  error_rate: number;
  p95_duration_ms: number;
  payload_capture_count: number;
  metadata_count: number;
  full_capture_count: number;
  redacted_capture_count: number;
}

interface HttpRequestFacetRow {
  facet_type: "service" | "method";
  value: string;
  request_count: number;
}

const RANGE_HOURS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 168,
  "30d": 720,
};

const STATUS_FILTERS = new Set(["success", "errors"]);
const CAPTURE_FILTERS = new Set(["metadata", "full", "redacted"]);

export const Route = createFileRoute("/api/$orgSlug/observability/requests/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;

        const url = new URL(request.url);
        const requestedRange = url.searchParams.get("range") || "1h";
        const range = RANGE_HOURS[requestedRange] ? requestedRange : "1h";
        const hours = RANGE_HOURS[range];
        const search = url.searchParams.get("search")?.trim() || undefined;
        const service = url.searchParams.get("service")?.trim() || undefined;
        const method = url.searchParams.get("method")?.trim() || undefined;
        const requestedStatus = url.searchParams.get("status")?.trim();
        const status =
          requestedStatus && STATUS_FILTERS.has(requestedStatus)
            ? requestedStatus
            : undefined;
        const requestedCapture = url.searchParams.get("capture")?.trim();
        const capture =
          requestedCapture && CAPTURE_FILTERS.has(requestedCapture)
            ? requestedCapture
            : undefined;
        const limit = Math.min(
          100,
          Math.max(1, Number(url.searchParams.get("limit")) || 50),
        );
        const includeFacets =
          url.searchParams.get("include_facets") !== "false";
        const cursor = requestCursor(url);
        const organizationId = orgResult.organization.id;

        try {
          const [rows, statistics, facets] = await Promise.all([
            queryTinybird<HttpRequestRow>("http_requests", {
              organization_id: organizationId,
              hours,
              search,
              service,
              method,
              status,
              capture,
              limit,
              before_timestamp: cursor?.timestamp,
              before_trace_id: cursor?.traceId,
              before_span_id: cursor?.spanId,
            }),
            queryTinybird<HttpRequestStatsRow>("http_request_stats", {
              organization_id: organizationId,
              hours,
              search,
              service,
              method,
              status,
              capture,
            }),
            includeFacets
              ? queryTinybird<HttpRequestFacetRow>("http_request_facets", {
                  organization_id: organizationId,
                  hours,
                })
              : Promise.resolve([] as HttpRequestFacetRow[]),
          ]);

          const requests = rows.map(mapRequestRow);
          const last = requests.at(-1);
          const hasMore = Boolean(Number(rows.at(-1)?.has_more || 0));
          const stats = statistics[0];

          return Response.json({
            requests,
            statistics: {
              totalRequests: Number(stats?.total_requests || 0),
              errorCount: Number(stats?.error_requests || 0),
              errorRate: Number(stats?.error_rate || 0),
              p95Duration: Number(stats?.p95_duration_ms || 0),
              payloadCaptureCount: Number(stats?.payload_capture_count || 0),
              metadataCount: Number(stats?.metadata_count || 0),
              fullCaptureCount: Number(stats?.full_capture_count || 0),
              redactedCaptureCount: Number(stats?.redacted_capture_count || 0),
            },
            ...(includeFacets
              ? {
                  services: facetValues(facets, "service"),
                  methods: facetValues(facets, "method"),
                }
              : {}),
            total: Number(stats?.total_requests || 0),
            hasMore,
            nextCursor:
              hasMore && last
                ? {
                    timestamp: last.timestamp,
                    traceId: last.traceId,
                    spanId: last.spanId,
                  }
                : null,
            limit,
            range,
          });
        } catch (error) {
          console.error("Failed to query observability HTTP requests", error);
          return Response.json(
            { error: "Request telemetry is temporarily unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});

function mapRequestRow(row: HttpRequestRow) {
  return {
    id: row.id,
    requestId: row.request_id,
    timestamp: row.timestamp,
    method: row.method || "HTTP",
    route: row.route,
    path: row.path || row.url,
    url: row.url,
    service: row.service || "unknown_service",
    environment: row.environment,
    region: row.region,
    statusCode: Number(row.status_code),
    isError: Boolean(Number(row.is_error)),
    duration: Number(row.duration_ms),
    traceId: row.trace_id,
    spanId: row.span_id,
    requestSize: Number(row.request_size),
    responseSize: Number(row.response_size),
    captureState: captureState(row.capture_state),
  };
}

function requestCursor(url: URL) {
  const timestamp = url.searchParams.get("before_timestamp")?.trim();
  const traceId = url.searchParams.get("before_trace_id")?.trim();
  const spanId = url.searchParams.get("before_span_id")?.trim();
  return timestamp && traceId && spanId ? { timestamp, traceId, spanId } : null;
}

function captureState(value: string): "full" | "metadata" | "redacted" {
  if (value === "full" || value === "redacted") return value;
  return "metadata";
}

function facetValues(rows: HttpRequestFacetRow[], type: "service" | "method") {
  return rows
    .filter((row) => row.facet_type === type && row.value)
    .sort(
      (left, right) => Number(right.request_count) - Number(left.request_count),
    )
    .map((row) => row.value);
}
