import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { uptimeMonitors } from "@/db/uptime-schema";
import { notificationEmailsBelongToOrganization } from "@/lib/observability/alert-access";
import { activeOrganizationKey } from "@/lib/secrets/database";
import { encryptUptimeHeaders } from "@/lib/secrets/crypto";
import { badInput, jsonBody, requireUptimeManager, requireUptimeRead, serializeMonitor } from "@/lib/uptime/api";
import { validateMonitorInput } from "@/lib/uptime/validation";
import { isAlertManagerRole } from "@/lib/observability/alert-validation";
import { getOrganizationLimits, withOrganizationQuotaLock } from "@/lib/organization-entitlements.server";

export const Route = createFileRoute("/api/$orgSlug/uptime/monitors/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const access = await requireUptimeRead(request, params.orgSlug);
        if ("error" in access) return access.error;
        const [monitors, limits] = await Promise.all([
          db.select().from(uptimeMonitors)
            .where(and(eq(uptimeMonitors.organizationId, access.organization.id), isNull(uptimeMonitors.deletedAt)))
            .orderBy(desc(uptimeMonitors.createdAt)),
          getOrganizationLimits(access.organization.id),
        ]);
        return Response.json({ monitors: monitors.map(serializeMonitor), limit: limits.maxUptimeMonitors, canManage: isAlertManagerRole(access.membership.role) });
      },
      POST: async ({ request, params }) => {
        const access = await requireUptimeManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const body = await jsonBody(request);
        if (body instanceof Response) return body;
        const input = validateMonitorInput(body);
        if (!input.success) return badInput(input.error, input.field);
        if (!await notificationEmailsBelongToOrganization(access.organization.id, input.data.notificationEmails)) {
          return badInput("Email recipients must be current organization members", "notificationEmails");
        }
        try {
          const result = await db.transaction(async (tx) => {
            await withOrganizationQuotaLock(tx, access.organization.id);
            const { maxUptimeMonitors: limit } = await getOrganizationLimits(access.organization.id, tx);
            if (limit !== -1) {
              const [existing] = await tx.select({ count: sql<number>`count(*)::int` }).from(uptimeMonitors)
                .where(and(eq(uptimeMonitors.organizationId, access.organization.id), isNull(uptimeMonitors.deletedAt)));
              if (existing.count >= limit) return { limitReached: true, limit } as const;
            }
            const id = crypto.randomUUID();
            let headersCiphertext = null;
            if (Object.keys(input.data.headers).length) {
              const key = await activeOrganizationKey(tx, access.organization.id);
              try {
                headersCiphertext = encryptUptimeHeaders(key.key, {
                  organizationId: access.organization.id,
                  monitorId: id,
                  organizationKeyVersion: key.version,
                  headers: input.data.headers,
                });
              } finally { key.key.fill(0); }
            }
            const [monitor] = await tx.insert(uptimeMonitors).values({
              id, organizationId: access.organization.id, createdBy: access.session!.user.id,
              name: input.data.name, url: input.data.url, method: input.data.method,
              headersCiphertext, expectedStatus: input.data.expectedStatus,
              responseText: input.data.responseText,
              notificationEmails: input.data.notificationEmails,
              failureThreshold: input.data.failureThreshold,
              incidentPublishing: input.data.incidentPublishing,
              publishAfterMinutes: input.data.publishAfterMinutes,
              enabled: input.data.enabled,
            }).returning();
            return { monitor } as const;
          });
          if ("limitReached" in result) return Response.json({ error: `Monitor limit reached: ${result.limit} monitors per organization`, limit: result.limit }, { status: 403 });
          return Response.json({ monitor: serializeMonitor(result.monitor) }, { status: 201 });
        } catch (error) {
          // Configuration errors are not exposed with key material or header values.
          console.error("Unable to create uptime monitor", error instanceof Error ? error.name : "error");
          return Response.json({ error: "Monitor could not be created" }, { status: 503 });
        }
      },
    },
  },
});
