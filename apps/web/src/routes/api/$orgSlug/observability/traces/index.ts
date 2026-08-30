import { createFileRoute } from "@tanstack/react-router";
import { requireOrgFromSlug } from "@/lib/org";
import { queryTinybird } from "@/lib/tinybird";

interface TraceRow {
  id: string;
  name: string;
  root_service: string;
  started_at: string;
  duration_ms: number;
  span_count: number;
  status: "ok" | "error";
  method: string;
}

interface TraceStatsRow {
  total_traces: number;
  error_traces: number;
  error_rate: number;
  p95_duration_ms: number;
  longest_duration_ms: number;
}

interface DurationBucketRow {
  bucket: string;
  trace_count: number;
}

const RANGE_HOURS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 168,
  "30d": 720,
};

export const Route = createFileRoute("/api/$orgSlug/observability/traces/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;

        const url = new URL(request.url);
        const range = url.searchParams.get("range") || "1h";
        const hours = RANGE_HOURS[range] || 1;
        const limit = Math.min(
          250,
          Math.max(1, Number(url.searchParams.get("limit")) || 100),
        );
        const search = url.searchParams.get("search")?.trim() || undefined;
        const errorsOnly = url.searchParams.get("errorsOnly") === "true";
        const organizationId = orgResult.organization.id;

        try {
          const [traces, statistics, distribution] = await Promise.all([
            queryTinybird<TraceRow>("traces", {
              organization_id: organizationId,
              hours,
              limit,
              search,
              errors_only: errorsOnly || undefined,
            }),
            queryTinybird<TraceStatsRow>("trace_stats", {
              organization_id: organizationId,
              hours,
            }),
            queryTinybird<DurationBucketRow>("trace_duration_distribution", {
              organization_id: organizationId,
              hours,
            }),
          ]);

          return Response.json({
            traces: traces.map((trace) => ({
              id: trace.id,
              name: trace.name,
              rootService: trace.root_service,
              startedAt: trace.started_at,
              duration: Number(trace.duration_ms),
              spanCount: Number(trace.span_count),
              status: trace.status,
              method: trace.method || "EVENT",
              spans: [],
            })),
            statistics: statistics[0]
              ? {
                  totalTraces: Number(statistics[0].total_traces),
                  errorTraces: Number(statistics[0].error_traces),
                  errorRate: Number(statistics[0].error_rate),
                  p95Duration: Number(statistics[0].p95_duration_ms),
                  longestDuration: Number(statistics[0].longest_duration_ms),
                }
              : {
                  totalTraces: 0,
                  errorTraces: 0,
                  errorRate: 0,
                  p95Duration: 0,
                  longestDuration: 0,
                },
            distribution: distribution.map((item) => ({
              bucket: item.bucket,
              count: Number(item.trace_count),
            })),
            range,
          });
        } catch (error) {
          console.error("Failed to query observability traces", error);
          return Response.json(
            { error: "Trace data is temporarily unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});
