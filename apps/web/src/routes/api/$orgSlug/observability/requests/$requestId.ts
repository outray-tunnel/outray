import { createFileRoute } from "@tanstack/react-router";
import { requireOrgFromSlug } from "@/lib/org";
import { queryTinybird } from "@/lib/tinybird";

interface HttpRequestDetailsRow {
  id: string;
  timestamp: string;
  request_id: string;
  method: string;
  route: string;
  path: string;
  url: string;
  service: string;
  service_namespace: string;
  service_version: string;
  environment: string;
  region: string;
  scope_name: string;
  scope_version: string;
  status_code: number;
  status_message: string;
  duration_ms: number;
  trace_id: string;
  span_id: string;
  capture_state: string;
  capture_version: string;
  scheme: string;
  server_address: string;
  server_port: number;
  protocol: string;
  client_address: string;
  user_agent: string;
  request_query: string;
  request_headers: string;
  request_headers_captured?: number | boolean;
  request_headers_truncated: number | boolean;
  request_body: string;
  request_body_captured?: number | boolean;
  request_body_size: number;
  request_body_truncated: number | boolean;
  request_body_content_type: string;
  response_headers: string;
  response_headers_captured?: number | boolean;
  response_headers_truncated: number | boolean;
  response_body: string;
  response_body_captured?: number | boolean;
  response_body_size: number;
  response_body_truncated: number | boolean;
  response_body_content_type: string;
  attributes: Record<string, string>;
  resource_attributes: Record<string, string>;
  scope_attributes: Record<string, string>;
  events: string;
  links: string;
}

interface CorrelatedLogRow {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

export const Route = createFileRoute(
  "/api/$orgSlug/observability/requests/$requestId",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const organizationId = orgResult.organization.id;

        try {
          const rows = await queryTinybird<HttpRequestDetailsRow>(
            "http_request_details",
            {
              organization_id: organizationId,
              request_id: params.requestId,
            },
          );
          const row = rows[0];
          if (!row) {
            return Response.json(
              { error: "HTTP request not found" },
              { status: 404 },
            );
          }

          const logs = row.trace_id
            ? await queryTinybird<CorrelatedLogRow>("logs", {
                organization_id: organizationId,
                hours: 720,
                trace_id: row.trace_id,
                limit: 50,
              }).catch((error) => {
                console.error("Failed to query correlated request logs", error);
                return [];
              })
            : [];

          return Response.json({
            request: mapDetails(row),
            logs: logs.map((log) => ({
              id: log.id,
              timestamp: log.timestamp,
              level: log.level,
              message: log.message,
            })),
          });
        } catch (error) {
          console.error("Failed to query HTTP request details", error);
          return Response.json(
            { error: "Request details are temporarily unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});

function mapDetails(row: HttpRequestDetailsRow) {
  const captureVersion = row.capture_version || "";
  const requestBodyCaptured = captured(
    row.request_body_captured,
    captureVersion,
    row.request_body,
    row.request_body_size,
    row.request_body_content_type,
  );
  const responseBodyCaptured = captured(
    row.response_body_captured,
    captureVersion,
    row.response_body,
    row.response_body_size,
    row.response_body_content_type,
  );

  return {
    id: row.id,
    requestId: row.request_id,
    timestamp: row.timestamp,
    method: row.method || "HTTP",
    route: row.route,
    path: row.path || row.url,
    url: row.url,
    service: row.service || "unknown_service",
    serviceNamespace: row.service_namespace,
    serviceVersion: row.service_version,
    environment: row.environment,
    region: row.region,
    scopeName: row.scope_name,
    scopeVersion: row.scope_version,
    statusCode: Number(row.status_code),
    statusMessage: row.status_message,
    duration: Number(row.duration_ms),
    traceId: row.trace_id,
    spanId: row.span_id,
    captureState: captureState(row.capture_state),
    captureVersion,
    scheme: row.scheme,
    serverAddress: row.server_address,
    serverPort: Number(row.server_port),
    protocol: row.protocol,
    clientAddress: row.client_address,
    userAgent: row.user_agent,
    request: {
      headers: parseRecord(row.request_headers),
      headersCaptured: captured(
        row.request_headers_captured,
        captureVersion,
        row.request_headers,
      ),
      headersTruncated: Boolean(Number(row.request_headers_truncated)),
      query: parseQuery(row.request_query),
      body: requestBodyCaptured ? row.request_body : null,
      bodyCaptured: requestBodyCaptured,
      bodyTruncated: Boolean(Number(row.request_body_truncated)),
      bodyContentType: row.request_body_content_type,
      size: Number(row.request_body_size),
    },
    response: {
      headers: parseRecord(row.response_headers),
      headersCaptured: captured(
        row.response_headers_captured,
        captureVersion,
        row.response_headers,
      ),
      headersTruncated: Boolean(Number(row.response_headers_truncated)),
      body: responseBodyCaptured ? row.response_body : null,
      bodyCaptured: responseBodyCaptured,
      bodyTruncated: Boolean(Number(row.response_body_truncated)),
      bodyContentType: row.response_body_content_type,
      size: Number(row.response_body_size),
    },
    attributes: row.attributes || {},
    resourceAttributes: row.resource_attributes || {},
    scopeAttributes: row.scope_attributes || {},
    events: parseArray(row.events),
    links: parseArray(row.links),
  };
}

function captured(
  explicit: number | boolean | undefined,
  captureVersion: string,
  value: string,
  size?: number,
  contentType?: string,
) {
  if (explicit !== undefined) return Boolean(Number(explicit));
  return Boolean(captureVersion && (value || Number(size) || contentType));
}

function captureState(value: string): "full" | "metadata" | "redacted" {
  if (value === "full" || value === "redacted") return value;
  return "metadata";
}

function parseRecord(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, item]) => [key, String(item)]),
    );
  } catch {
    return {};
  }
}

function parseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseQuery(value: string): Record<string, string> {
  const normalized = value.trim();
  if (!normalized) return {};

  // Tinybird emits a raw query string, while older rows may contain the
  // query as a serialized object.
  if (normalized.startsWith("{")) return parseRecord(normalized);

  const query = normalized.startsWith("?") ? normalized.slice(1) : normalized;
  const entries = Array.from(new URLSearchParams(query).entries());
  return entries.length > 0
    ? Object.fromEntries(entries)
    : parseRecord(normalized);
}
