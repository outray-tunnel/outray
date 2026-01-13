import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscriptions } from "@/db/subscription-schema";
import { redis } from "@/lib/redis";
import { SUBSCRIPTION_PLANS } from "@/lib/subscription-plans";
import { requireOrgFromSlug } from "@/lib/org";
import { getBandwidthKey } from "../../../../../../../shared/utils";

export const Route = createFileRoute("/api/$orgSlug/stats/bandwidth")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization } = orgResult;

        const key = getBandwidthKey(organization.id);
        const usageStr = await redis.get(key);
        const usage = parseInt(usageStr || "0", 10);

        const subscription = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.organizationId, organization.id))
          .limit(1);

        const planId = subscription[0]?.plan || "free";
        const plan =
          SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS];
        const limit = plan.features.bandwidthPerMonth;

        return Response.json({
          usage,
          limit,
          percentage: Math.min((usage / limit) * 100, 100),
        });
      },
    },
  },
});
