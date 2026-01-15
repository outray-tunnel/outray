import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import { subscriptions, organizations } from "../../../db/schema";
import { redis } from "../../../lib/redis";
import { hashToken } from "../../../lib/hash";
import { SUBSCRIPTION_PLANS } from "../../../lib/subscription-plans";
import { count, desc, eq, gte } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/subscriptions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Admin token check
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length)
          : "";

        if (!token) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tokenKey = `admin:token:${hashToken(token)}`;
        const exists = await redis.get(tokenKey);
        if (!exists) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        try {
          const url = new URL(request.url);
          const page = Math.max(
            1,
            parseInt(url.searchParams.get("page") || "1") || 1,
          );
          const limit = Math.min(
            100,
            Math.max(1, parseInt(url.searchParams.get("limit") || "20") || 20),
          );
          const planFilter = url.searchParams.get("plan") || "";
          const offset = (page - 1) * limit;

          // Build filter condition
          const filterCondition = planFilter
            ? eq(subscriptions.plan, planFilter)
            : undefined;

          // Get total count
          const [totalResult] = await db
            .select({ count: count() })
            .from(subscriptions)
            .where(filterCondition);

          // Get subscriptions with org info
          const subscriptionList = await db
            .select({
              id: subscriptions.id,
              organizationId: subscriptions.organizationId,
              plan: subscriptions.plan,
              status: subscriptions.status,
              currentPeriodEnd: subscriptions.currentPeriodEnd,
              cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
              createdAt: subscriptions.createdAt,
              updatedAt: subscriptions.updatedAt,
              orgName: organizations.name,
              orgSlug: organizations.slug,
            })
            .from(subscriptions)
            .leftJoin(
              organizations,
              eq(subscriptions.organizationId, organizations.id),
            )
            .where(filterCondition)
            .orderBy(desc(subscriptions.updatedAt))
            .limit(limit)
            .offset(offset);

          // Get plan distribution
          const planDistribution = await db
            .select({
              plan: subscriptions.plan,
              status: subscriptions.status,
              count: count(),
            })
            .from(subscriptions)
            .groupBy(subscriptions.plan, subscriptions.status);

          const activeByPlan: Record<string, number> = {};
          const cancelledByPlan: Record<string, number> = {};

          planDistribution.forEach((item) => {
            if (item.status === "active") {
              activeByPlan[item.plan] =
                (activeByPlan[item.plan] || 0) + item.count;
            } else if (item.status === "cancelled") {
              cancelledByPlan[item.plan] =
                (cancelledByPlan[item.plan] || 0) + item.count;
            }
          });

          // Calculate stats using actual plan prices
          const mrr = Object.entries(activeByPlan).reduce(
            (total, [plan, planCount]) => {
              const planConfig =
                SUBSCRIPTION_PLANS[plan as keyof typeof SUBSCRIPTION_PLANS];
              return total + (planConfig?.price || 0) * planCount;
            },
            0,
          );

          const totalActive = Object.values(activeByPlan).reduce(
            (a, b) => a + b,
            0,
          );
          const totalCancelled = Object.values(cancelledByPlan).reduce(
            (a, b) => a + b,
            0,
          );

          // Get recent changes (last 30 days)
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const [recentChanges] = await db
            .select({ count: count() })
            .from(subscriptions)
            .where(gte(subscriptions.updatedAt, thirtyDaysAgo));

          return Response.json({
            subscriptions: subscriptionList,
            total: totalResult.count,
            page,
            totalPages: Math.ceil(totalResult.count / limit),
            stats: {
              mrr,
              arr: mrr * 12,
              totalActive,
              totalCancelled,
              activeByPlan,
              recentChanges: recentChanges.count,
            },
          });
        } catch (error) {
          console.error("Admin subscriptions error:", error);
          return Response.json(
            { error: "Failed to fetch subscriptions" },
            { status: 500 },
          );
        }
      },
    },
  },
});
