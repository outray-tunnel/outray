import { createFileRoute } from "@tanstack/react-router";
import { requireOrgFromSlug } from "@/lib/org";
import { queryTinybird } from "@/lib/tinybird";

interface LogRow {
  id: string;
  timestamp: string;
  observed_timestamp: string;
  severity_number: number;
  severity_text: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  event_name: string;
  trace_id: string;
  span_id: string;
  flags: number;
  service: string;
  service_namespace: string;
  service_version: string;
  environment: string;
  region: string;
  scope_name: string;
  scope_version: string;
  attributes: Record<string, string>;
  resource_attributes: Record<string, string>;
  scope_attributes: Record<string, string>;
}

interface LogServiceRow {
  service: string;
}

const RANGE_HOURS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 168,
  "30d": 720,
};

const LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);

export const Route = createFileRoute("/api/$orgSlug/observability/logs/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;

        const url = new URL(request.url);
        const range = url.searchParams.get("range") || "1h";
        const hours = RANGE_HOURS[range] || 1;
        const search = url.searchParams.get("search")?.trim() || undefined;
        const service = url.searchParams.get("service")?.trim() || undefined;
        const requestedLevel = url.searchParams.get("level")?.trim();
        const level =
          requestedLevel && LOG_LEVELS.has(requestedLevel)
            ? requestedLevel
            : undefined;
        const limit = Math.min(
          500,
          Math.max(1, Number(url.searchParams.get("limit")) || 250),
        );
        const organizationId = orgResult.organization.id;

        try {
          const [logs, services] = await Promise.all([
            queryTinybird<LogRow>("logs", {
              organization_id: organizationId,
              hours,
              search,
              service,
              level,
              limit,
            }),
            queryTinybird<LogServiceRow>("log_services", {
              organization_id: organizationId,
              hours: Math.max(hours, 24),
            }),
          ]);

          return Response.json({
            logs: logs.map((log) => ({
              id: log.id,
              timestamp: log.timestamp,
              observedTimestamp: log.observed_timestamp,
              level: log.level,
              severityNumber: Number(log.severity_number),
              severityText: log.severity_text,
              message: log.message,
              eventName: log.event_name,
              traceId: log.trace_id,
              spanId: log.span_id,
              flags: Number(log.flags),
              service: log.service,
              serviceNamespace: log.service_namespace,
              serviceVersion: log.service_version,
              environment: log.environment,
              region: log.region,
              scopeName: log.scope_name,
              scopeVersion: log.scope_version,
              attributes: log.attributes,
              resourceAttributes: log.resource_attributes,
              scopeAttributes: log.scope_attributes,
            })),
            services: services.map((item) => item.service).filter(Boolean),
            range,
          });
        } catch (error) {
          console.error("Failed to query observability logs", error);
          return Response.json(
            { error: "Log data is temporarily unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});
