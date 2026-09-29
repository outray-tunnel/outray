import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { incidents } from "@/db/alerts-schema";
import { uptimeChecks, uptimeMonitors } from "@/db/uptime-schema";
import { notificationEmailsBelongToOrganization } from "@/lib/observability/alert-access";
import { activeOrganizationKey } from "@/lib/secrets/database";
import { encryptUptimeHeaders } from "@/lib/secrets/crypto";
import { badInput, jsonBody, notFound, requireUptimeManager, requireUptimeRead, serializeMonitor } from "@/lib/uptime/api";
import { UPTIME_LIMITS, validateMonitorInput } from "@/lib/uptime/validation";

export const Route = createFileRoute("/api/$orgSlug/uptime/monitors/$monitorId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const access = await requireUptimeRead(request, params.orgSlug);
        if ("error" in access) return access.error;
        const monitor = await findMonitor(access.organization.id, params.monitorId);
        if (!monitor) return notFound("Monitor");
        const cutoff = new Date(Date.now() - UPTIME_LIMITS.checkHistoryDays * 86_400_000);
        const [checks, totals, incidentRows] = await Promise.all([
          db.select().from(uptimeChecks).where(and(
            eq(uptimeChecks.organizationId, access.organization.id), eq(uptimeChecks.monitorId, monitor.id),
            gte(uptimeChecks.checkedAt, cutoff),
          )).orderBy(desc(uptimeChecks.checkedAt)).limit(200),
          db.select({
            total: sql<number>`count(*)::int`,
            successful: sql<number>`count(*) FILTER (WHERE ${uptimeChecks.success})::int`,
            averageLatencyMs: sql<number | null>`avg(${uptimeChecks.latencyMs})::float8`,
          }).from(uptimeChecks).where(and(
            eq(uptimeChecks.organizationId, access.organization.id), eq(uptimeChecks.monitorId, monitor.id),
            gte(uptimeChecks.checkedAt, cutoff),
          )),
          db.select().from(incidents).where(and(
            eq(incidents.organizationId, access.organization.id),
            eq(incidents.sourceType, "uptime_monitor"), eq(incidents.sourceId, monitor.id),
          )).orderBy(desc(incidents.startedAt)).limit(50),
        ]);
        const observed = totals[0] ?? { total: 0, successful: 0, averageLatencyMs: null };
        return Response.json({
          monitor: serializeMonitor(monitor), checks, incidents: incidentRows,
          summary: {
            observedChecks: observed.total,
            observedUptimePercent: observed.total ? 100 * observed.successful / observed.total : null,
            averageLatencyMs: observed.averageLatencyMs,
            historyDays: UPTIME_LIMITS.checkHistoryDays,
          },
        });
      },
      PATCH: async ({ request, params }) => {
        const access = await requireUptimeManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const body = await jsonBody(request);
        if (body instanceof Response) return body;
        if (!Object.keys(body).length) return badInput("At least one field is required");
        const monitor = await findMonitor(access.organization.id, params.monitorId);
        if (!monitor) return notFound("Monitor");
        const input = validateMonitorInput(body, {
          name: monitor.name, url: monitor.url, method: monitor.method as "GET" | "HEAD",
          headers: {}, expectedStatus: monitor.expectedStatus, responseText: monitor.responseText,
          notificationEmails: monitor.notificationEmails, enabled: monitor.enabled,
        });
        if (!input.success) return badInput(input.error, input.field);
        if (!await notificationEmailsBelongToOrganization(access.organization.id, input.data.notificationEmails)) {
          return badInput("Email recipients must be current organization members", "notificationEmails");
        }
        try {
          const updated = await db.transaction(async (tx) => {
            const [locked] = await tx.select({ id: uptimeMonitors.id }).from(uptimeMonitors).where(and(
              eq(uptimeMonitors.id, monitor.id), eq(uptimeMonitors.organizationId, access.organization.id),
              isNull(uptimeMonitors.deletedAt),
            )).for("update").limit(1);
            if (!locked) return null;
            let headersCiphertext = monitor.headersCiphertext;
            if (Object.hasOwn(body, "headers")) {
              headersCiphertext = null;
              if (Object.keys(input.data.headers).length) {
                const key = await activeOrganizationKey(tx, access.organization.id);
                try {
                  headersCiphertext = encryptUptimeHeaders(key.key, {
                    organizationId: access.organization.id,
                    monitorId: monitor.id,
                    organizationKeyVersion: key.version,
                    headers: input.data.headers,
                  });
                } finally { key.key.fill(0); }
              }
            } else if (input.data.url !== monitor.url) {
              // Credentials configured for one origin must never be silently
              // forwarded to a different destination after an edit.
              headersCiphertext = null;
            }
            const targetChanged = monitor.url !== input.data.url || monitor.method !== input.data.method ||
              monitor.expectedStatus !== input.data.expectedStatus || monitor.responseText !== input.data.responseText ||
              Object.hasOwn(body, "headers") || monitor.enabled !== input.data.enabled;
            const [row] = await tx.update(uptimeMonitors).set({
              name: input.data.name, url: input.data.url, method: input.data.method,
              headersCiphertext, expectedStatus: input.data.expectedStatus, responseText: input.data.responseText,
              notificationEmails: input.data.notificationEmails, enabled: input.data.enabled,
              ...(targetChanged ? {
                state: "unknown", failureStreak: 0, successStreak: 0,
                lastCheckedAt: null, lastStateChangedAt: new Date(), nextCheckAt: new Date(),
                leaseOwner: null, leaseUntil: null,
              } : {}),
              updatedAt: new Date(),
            }).where(eq(uptimeMonitors.id, monitor.id)).returning();
            return row;
          });
          if (!updated) return notFound("Monitor");
          return Response.json({ monitor: serializeMonitor(updated) });
        } catch (error) {
          console.error("Unable to update uptime monitor", error instanceof Error ? error.name : "error");
          return Response.json({ error: "Monitor could not be updated" }, { status: 503 });
        }
      },
      DELETE: async ({ request, params }) => {
        const access = await requireUptimeManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const now = new Date();
        const [deleted] = await db.update(uptimeMonitors).set({
          deletedAt: now, enabled: false, state: "unknown", leaseOwner: null, leaseUntil: null,
          updatedAt: now,
        }).where(and(eq(uptimeMonitors.id, params.monitorId),
          eq(uptimeMonitors.organizationId, access.organization.id), isNull(uptimeMonitors.deletedAt)))
          .returning({ id: uptimeMonitors.id });
        if (!deleted) return notFound("Monitor");
        await db.update(incidents).set({ status: "resolved", resolvedAt: now, updatedAt: now })
          .where(and(eq(incidents.organizationId, access.organization.id),
            eq(incidents.sourceType, "uptime_monitor"), eq(incidents.sourceId, deleted.id),
            eq(incidents.status, "open")));
        return Response.json({ success: true });
      },
    },
  },
});

async function findMonitor(organizationId: string, monitorId: string) {
  const [monitor] = await db.select().from(uptimeMonitors).where(and(
    eq(uptimeMonitors.id, monitorId), eq(uptimeMonitors.organizationId, organizationId),
    isNull(uptimeMonitors.deletedAt),
  )).limit(1);
  return monitor;
}
