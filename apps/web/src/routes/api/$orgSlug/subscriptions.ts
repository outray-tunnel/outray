import { createFileRoute } from "@tanstack/react-router";
import { and, eq, count } from "drizzle-orm";

import { db } from "../../../db";
import { subscriptions } from "../../../db/subscription-schema";
import { domains, subdomains } from "../../../db/app-schema";
import { members } from "../../../db/auth-schema";
import { redis } from "../../../lib/redis";
import { requireOrgFromSlug } from "../../../lib/org";
import { cachedDashboardRedisRead } from "../../../lib/dashboard-redis-cache";
import { instanceConfig } from "../../../../../../shared/instance-config";

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

          const [[domainCount], [subdomainCount], [memberCount], liveTunnels] =
            await Promise.all([
              db
                .select({ value: count() })
                .from(domains)
                .where(and(eq(domains.organizationId, organizationId), eq(domains.purpose, "tunnel"))),
              db
                .select({ value: count() })
                .from(subdomains)
                .where(eq(subdomains.organizationId, organizationId)),
              db
                .select({ value: count() })
                .from(members)
                .where(eq(members.organizationId, organizationId)),
              cachedDashboardRedisRead(
                `online-tunnel-count:${organizationId}`,
                () => redis.scard(`org:${organizationId}:online_tunnels`),
              ),
            ]);

          return new Response(
            JSON.stringify({
              subscription: instanceConfig().selfHosted
                ? { plan: "unlimited", status: "active", organizationId }
                : subscription || null,
              instanceLimits: instanceConfig().selfHosted ? instanceConfig().limits : null,
              usage: {
                tunnels: Number(liveTunnels ?? 0),
                domains: Number(domainCount?.value ?? 0),
                subdomains: Number(subdomainCount?.value ?? 0),
                members: Number(memberCount?.value ?? 0),
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
