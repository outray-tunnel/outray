import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/subscription-schema";
import { redis } from "@/lib/redis";
import { getPlanLimits, installationPlan } from "@/lib/subscription-plans";
import { requireOrgFromSlug } from "@/lib/org";
import { cachedDashboardRead, dashboardCacheKey } from "@/lib/dashboard-cache";
import { cachedDashboardRedisRead } from "@/lib/dashboard-redis-cache";
import { getBandwidthKey } from "../../../../../../../shared/utils";

export const Route = createFileRoute("/api/$orgSlug/stats/bandwidth")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization } = orgResult;

        const responseBody = await cachedDashboardRead(
          dashboardCacheKey("bandwidth", { organizationId: organization.id }),
          async () => {
            const key = getBandwidthKey(organization.id);
            const [usageStr, subscription] = await Promise.all([
              cachedDashboardRedisRead(
                `bandwidth-usage:${organization.id}`,
                () => redis.get(key),
              ),
              db
                .select()
                .from(subscriptions)
                .where(eq(subscriptions.organizationId, organization.id))
                .limit(1),
            ]);
            const usage = parseInt(usageStr || "0", 10);

            const limit = getPlanLimits(installationPlan(subscription[0]?.plan)).bandwidthPerMonth;

            return {
              usage,
              limit,
              percentage: Math.min((usage / limit) * 100, 100),
            };
          },
        );

        return Response.json(responseBody);
      },
    },
  },
});
