import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { incidents, notifications, observabilityAlerts } from "@/db/alerts-schema";
import { uptimeIncidentComponents, uptimeIncidentUpdates, uptimeMonitors } from "@/db/uptime-schema";
import { canManageUptime, notFound, requireUptimeRead } from "@/lib/uptime/api";

export const Route = createFileRoute("/api/$orgSlug/uptime/incidents/$incidentId")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const access = await requireUptimeRead(request, params.orgSlug);
      if ("error" in access) return access.error;
      const [incident] = await db.select().from(incidents).where(and(
        eq(incidents.id, params.incidentId), eq(incidents.organizationId, access.organization.id),
      )).limit(1);
      if (!incident || !["uptime_monitor", "uptime_manual", "observability_alert"].includes(incident.sourceType)) return notFound("Incident");
      const [updates, links, notificationRows, canManage, monitors, alerts] = await Promise.all([
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
        canManageUptime(access.organization.id, access.session?.user.id),
        incident.sourceType === "uptime_monitor" ? db.select({ id: uptimeMonitors.id }).from(uptimeMonitors).where(and(
          eq(uptimeMonitors.id, incident.sourceId), eq(uptimeMonitors.organizationId, access.organization.id),
          isNull(uptimeMonitors.deletedAt),
        )).limit(1) : [],
        incident.sourceType === "observability_alert" ? db.select({ id: observabilityAlerts.id,
          name: observabilityAlerts.name, service: observabilityAlerts.service,
          environment: observabilityAlerts.environment, deletedAt: observabilityAlerts.deletedAt }).from(observabilityAlerts)
          .where(and(eq(observabilityAlerts.id, incident.sourceId), eq(observabilityAlerts.organizationId, access.organization.id)))
          .limit(1) : [],
      ]);
      const alert = alerts[0];
      const snapshot = incident.sourceSnapshot;
      const observabilitySource = incident.sourceType === "observability_alert" ? {
        alertId: incident.sourceId, alertName: alert?.name ?? (typeof snapshot.name === "string" ? snapshot.name : incident.title),
        service: alert?.service ?? (typeof snapshot.service === "string" ? snapshot.service : null),
        environment: alert?.environment ?? (typeof snapshot.environment === "string" ? snapshot.environment : null),
        alertAvailable: Boolean(alert && !alert.deletedAt), impact: incident.publicImpact,
        recoveryConfirmed: incident.status === "resolved" && incident.recoveryConfirmed, publicTitle: incident.publicTitle,
      } : null;
      return Response.json({ incident, updates, componentIds: links.map((link) => link.componentId),
        notifications: notificationRows, canManage, monitorAvailable: monitors.length > 0, observabilitySource });
    },
  } },
});
