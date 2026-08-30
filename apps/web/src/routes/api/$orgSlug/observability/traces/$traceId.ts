import { createFileRoute } from "@tanstack/react-router";
import { requireOrgFromSlug } from "@/lib/org";
import { queryTinybird } from "@/lib/tinybird";

interface SpanRow {
  trace_id: string;
  span_id: string;
  parent_span_id: string;
  name: string;
  service: string;
  started_at: string;
  duration_ms: number;
  offset_ms: number;
  status: "ok" | "error";
  kind: number;
  status_message: string;
  attributes: Record<string, string>;
  resource_attributes: Record<string, string>;
  events: string;
  links: string;
}

export const Route = createFileRoute(
  "/api/$orgSlug/observability/traces/$traceId",
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;

        try {
          const spans = await queryTinybird<SpanRow>("trace_details", {
            organization_id: orgResult.organization.id,
            trace_id: params.traceId,
          });

          if (spans.length === 0) {
            return Response.json({ error: "Trace not found" }, { status: 404 });
          }

          return Response.json({
            traceId: params.traceId,
            spans: spans.map((span) => ({
              id: span.span_id,
              parentId: span.parent_span_id || null,
              name: span.name,
              service: span.service,
              startedAt: span.started_at,
              duration: Number(span.duration_ms),
              offset: Number(span.offset_ms),
              status: span.status,
              kind: Number(span.kind),
              statusMessage: span.status_message,
              attributes: span.attributes,
              resourceAttributes: span.resource_attributes,
              events: JSON.parse(span.events || "[]"),
              links: JSON.parse(span.links || "[]"),
            })),
          });
        } catch (error) {
          console.error("Failed to query trace details", error);
          return Response.json(
            { error: "Trace details are temporarily unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});
