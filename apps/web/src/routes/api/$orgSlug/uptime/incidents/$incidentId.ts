import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { incidents, notifications } from "@/db/alerts-schema";
import { uptimeIncidentComponents, uptimeIncidentUpdates } from "@/db/uptime-schema";
import { notFound, requireUptimeRead } from "@/lib/uptime/api";

export const Route = createFileRoute("/api/$orgSlug/uptime/incidents/$incidentId")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const access = await requireUptimeRead(request, params.orgSlug);
      if ("error" in access) return access.error;
      const [incident] = await db.select().from(incidents).where(and(
        eq(incidents.id, params.incidentId), eq(incidents.organizationId, access.organization.id),
      )).limit(1);
      if (!incident || !["uptime_monitor", "uptime_manual"].includes(incident.sourceType)) return notFound("Incident");
      const [updates, links, notificationRows] = await Promise.all([
        db.select().from(uptimeIncidentUpdates).where(and(
          eq(uptimeIncidentUpdates.incidentId, incident.id),
          eq(uptimeIncidentUpdates.organizationId, access.organization.id),
        )).orderBy(desc(uptimeIncidentUpdates.createdAt)),
        db.select().from(uptimeIncidentComponents).where(and(
          eq(uptimeIncidentComponents.incidentId, incident.id),
          eq(uptimeIncidentComponents.organizationId, access.organization.id),
        )),
        db.select({ id: notifications.id, event: notifications.event, channel: notifications.channel,
          status: notifications.status, attempts: notifications.attempts, lastError: notifications.lastError,
          sentAt: notifications.sentAt, createdAt: notifications.createdAt,
        }).from(notifications).where(and(eq(notifications.incidentId, incident.id),
          eq(notifications.organizationId, access.organization.id))).orderBy(desc(notifications.createdAt)).limit(100),
      ]);
      return Response.json({ incident, updates, componentIds: links.map((link) => link.componentId), notifications: notificationRows });
    },
  } },
});
