import { createFileRoute } from "@tanstack/react-router";
import { and, eq, or } from "drizzle-orm";
import { db } from "../../../../db";
import { tunnels } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";
import { queryTinybird } from "../../../../lib/tinybird";
import { getTunnelEventIdentifiers } from "../../../../lib/tunnel-event-identifiers";
import { serializeTunnelCapture, type TunnelCaptureRow } from "../../../../lib/tunnel-tinybird";

export const Route = createFileRoute("/api/$orgSlug/requests/capture")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const orgContext = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgContext) return orgContext.error;
        let body: unknown;
        try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body" }, { status: 400 }); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid request body" }, { status: 400 });
        const { tunnelId, timestamp, requestId } = body as Record<string, unknown>;
        if (typeof tunnelId !== "string" || !tunnelId || tunnelId.length > 256 || (typeof timestamp !== "string" && typeof timestamp !== "number") || (typeof timestamp === "string" && (!timestamp || timestamp.length > 100)) || !Number.isFinite(new Date(timestamp).getTime()) || (requestId !== undefined && requestId !== null && (typeof requestId !== "string" || !requestId || requestId.length > 256))) {
          return Response.json({ error: "Valid tunnelId and timestamp are required" }, { status: 400 });
        }

        try {
          // Older HTTP events stored a hostname or reserved name instead of the
          // tunnel's database ID. Resolve only within the authenticated tenant.
          const [tunnel] = await db.select().from(tunnels).where(and(
            eq(tunnels.organizationId, orgContext.organization.id),
            or(eq(tunnels.id, tunnelId), eq(tunnels.name, tunnelId), eq(tunnels.url, `https://${tunnelId}`), eq(tunnels.url, `http://${tunnelId}`)),
          ));
          if (tunnel && tunnel.organizationId !== orgContext.organization.id) return Response.json({ error: "Request capture not found" }, { status: 404 });
          const timestampDate = new Date(timestamp);
          const captures = await queryTinybird<TunnelCaptureRow>("tunnel_capture", {
            organization_id: orgContext.organization.id,
            // A removed tunnel's retained capture is still organization-owned.
            tunnel_ids: JSON.stringify(tunnel ? getTunnelEventIdentifiers(tunnel) : [tunnelId]),
            request_id: typeof requestId === "string" ? requestId : undefined,
            timestamp: timestampDate.toISOString(),
            start: new Date(timestampDate.getTime() - 30_000).toISOString(),
            end: new Date(timestampDate.getTime() + 30_000).toISOString(),
          }, { cache: "no-store", maximumResponseBytes: 4 * 1_048_576 });
          const capture = captures[0];
          if (!capture) return Response.json({ error: "Request capture not found" }, { status: 404 });
          return Response.json({ capture: serializeTunnelCapture(capture) });
        } catch (error) {
          console.error("Error fetching request capture:", error);
          return Response.json({ error: "Failed to fetch request capture" }, { status: 500 });
        }
      },
    },
  },
});
