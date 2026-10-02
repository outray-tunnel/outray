import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { incidents } from "@/db/alerts-schema";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { lockUptimeOrganization } from "@/lib/uptime/incident-api";

export const Route = createFileRoute("/api/$orgSlug/uptime/incidents/$incidentId/decision")({
  server: { handlers: {
    POST: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      if (body.action !== "ignore" || Object.keys(body).length !== 1) {
        return badInput("Choose a valid detection action", "action");
      }
      const result = await db.transaction(async (tx) => {
        await lockUptimeOrganization(tx, access.organization.id);
        const [incident] = await tx.select().from(incidents).where(and(
          eq(incidents.id, params.incidentId), eq(incidents.organizationId, access.organization.id),
          eq(incidents.sourceType, "uptime_monitor"),
        )).for("update").limit(1);
        if (!incident) return { kind: "missing" as const };
        if (incident.status !== "open" || incident.uptimePublicationState !== "detected") {
          return { kind: "conflict" as const };
        }
        const [updated] = await tx.update(incidents).set({ uptimePublicationState: "ignored", updatedAt: new Date() })
          .where(and(eq(incidents.id, incident.id), eq(incidents.organizationId, access.organization.id)))
          .returning();
        return { kind: "updated" as const, incident: updated };
      });
      if (result.kind === "missing") return notFound("Detected issue");
      if (result.kind === "conflict") return Response.json({ error: "Only an active, unpublished detection can be ignored" }, { status: 409 });
      return Response.json({ incident: result.incident });
    },
  } },
});
