import { createFileRoute } from "@tanstack/react-router";
import { eq, sql } from "drizzle-orm";

import { db } from "../../../db";
import { subscriptions } from "../../../db/subscription-schema";
import { redis } from "../../../lib/redis";
import { requireOrgFromSlug } from "../../../lib/org";
import { cachedDashboardRedisRead } from "../../../lib/dashboard-redis-cache";
import { instanceConfig } from "../../../../../../shared/instance-config";
import { getBandwidthKey } from "../../../../../../shared/utils";

export const Route = createFileRoute("/api/$orgSlug/subscriptions")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization } = orgResult;

        const organizationId = organization.id;

        try {
          const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.organizationId, organizationId))
            .limit(1);

          const now = new Date();
          const month = now.toISOString().slice(0, 7) + "-01";
          const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
          const [counts, liveTunnels, bandwidthBytes] =
            await Promise.all([
              // One round-trip for the product counts; no plaintext secret values.
              db.execute(sql`SELECT
                (SELECT count(*) FROM domains WHERE organization_id = ${organizationId} AND purpose = 'tunnel') AS domains,
                (SELECT count(*) FROM subdomains WHERE organization_id = ${organizationId}) AS subdomains,
                (SELECT count(*) FROM members WHERE organization_id = ${organizationId}) AS members,
                (SELECT count(*) FROM invitations i WHERE i.organization_id = ${organizationId}
                  AND i.status IN ('pending', 'accepted') AND i.expires_at > ${now}
                  AND NOT EXISTS (SELECT 1 FROM members m JOIN users u ON u.id = m.user_id
                    WHERE m.organization_id = i.organization_id AND lower(u.email) = lower(i.email))) AS reserved_member_seats,
                (SELECT count(*) FROM uptime_monitors WHERE organization_id = ${organizationId} AND deleted_at IS NULL) AS monitors,
                (SELECT count(*) FROM observability_alerts WHERE organization_id = ${organizationId} AND deleted_at IS NULL) AS alerts,
                (SELECT count(*) FROM secret_projects WHERE organization_id = ${organizationId} AND deleted_at IS NULL) AS vaults,
                (SELECT count(*) FROM secret_entries WHERE organization_id = ${organizationId} AND deleted_at IS NULL) AS secrets,
                (SELECT count(*) FROM uptime_status_pages WHERE organization_id = ${organizationId}) AS status_pages,
                COALESCE((SELECT used FROM organization_monthly_usage WHERE organization_id = ${organizationId} AND month = ${month}::date AND metric = 'telemetry_bytes'), 0) AS telemetry_bytes`),
              cachedDashboardRedisRead(
                `online-tunnel-count:${organizationId}`,
                () => redis.scard(`org:${organizationId}:online_tunnels`),
              ),
              cachedDashboardRedisRead(`bandwidth-usage:${organizationId}:${month}`,
                () => redis.get(getBandwidthKey(organizationId, now))),
            ]);
          const usage = counts.rows[0] ?? {};

          return new Response(
            JSON.stringify({
              subscription: instanceConfig().selfHosted
                ? { plan: "unlimited", status: "active", organizationId }
                : subscription || null,
              instanceLimits: instanceConfig().selfHosted ? {
                ...instanceConfig().limits, retentionDays: instanceConfig().retentionDays,
              } : null,
              usage: {
                tunnels: Number(liveTunnels ?? 0),
                domains: Number(usage.domains ?? 0),
                subdomains: Number(usage.subdomains ?? 0),
                members: Number(usage.members ?? 0),
                reservedMemberSeats: Number(usage.reserved_member_seats ?? 0),
                uptimeMonitors: Number(usage.monitors ?? 0),
                observabilityAlerts: Number(usage.alerts ?? 0),
                secretVaults: Number(usage.vaults ?? 0),
                secretEntries: Number(usage.secrets ?? 0),
                statusPages: Number(usage.status_pages ?? 0),
                bandwidthBytes: Number(bandwidthBytes ?? 0),
                telemetryBytes: Number(usage.telemetry_bytes ?? 0),
                telemetryMonth: month.slice(0, 7),
                telemetryResetsAt: resetsAt,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (error) {
          console.error("Error fetching subscription:", error);
          return new Response(
            JSON.stringify({ error: "Failed to fetch subscription" }),
            { status: 500 },
          );
        }
      },
    },
  },
});
