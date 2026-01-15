import { createFileRoute } from "@tanstack/react-router";
import { eq, count } from "drizzle-orm";
import { db } from "../../../db";
import { subdomains } from "../../../db/app-schema";
import { subscriptions } from "../../../db/subscription-schema";
import { SUBSCRIPTION_PLANS } from "../../../lib/subscription-plans";

export const Route = createFileRoute("/api/tunnel/check-subdomain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { subdomain, organizationId, checkLimit = false } = body;

          if (!subdomain) {
            return Response.json(
              { allowed: false, error: "Missing subdomain" },
              { status: 400 },
            );
          }

          const existingSubdomain = await db
            .select({
              subdomain: subdomains.subdomain,
              organizationId: subdomains.organizationId,
            })
            .from(subdomains)
            .where(eq(subdomains.subdomain, subdomain))
            .limit(1);

          if (existingSubdomain.length > 0) {
            const record = existingSubdomain[0];
            if (organizationId && record.organizationId === organizationId) {
              return Response.json({ allowed: true, type: "owned" });
            }
            return Response.json({
              allowed: false,
              error: "Subdomain already taken",
            });
          }

          // Only check limits if explicitly requested (for subdomain reservation, not tunnel use)
          // For tunnel creation, we don't count against reserved subdomain limits
          if (organizationId && checkLimit) {
            const [subscription] = await db
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.organizationId, organizationId))
              .limit(1);

            const planId = (subscription?.plan ||
              "free") as keyof typeof SUBSCRIPTION_PLANS;
            const plan = SUBSCRIPTION_PLANS[planId];
            const maxSubdomains = plan.features.maxSubdomains;

            const [subdomainCount] = await db
              .select({ count: count() })
              .from(subdomains)
              .where(eq(subdomains.organizationId, organizationId));

            if (subdomainCount.count >= maxSubdomains) {
              return Response.json({
                allowed: false,
                error: `Subdomain limit reached for ${plan.name} plan. Upgrade to add more.`,
              });
            }
          }

          return Response.json({ allowed: true, type: "available" });
        } catch (error) {
          console.error("Error in /api/tunnel/check-subdomain:", error);
          return Response.json(
            {
              allowed: false,
              error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
