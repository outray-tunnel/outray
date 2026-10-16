import { createFileRoute } from "@tanstack/react-router";
import { adminJson, requireAdminAccess } from "../../../lib/admin-access.server";
import { db } from "../../../db";
import { subscriptions } from "../../../db/schema";
import { SUBSCRIPTION_PLANS } from "../../../lib/subscription-plans";
import { sql, count, lte, and, gte } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/revenue-history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await requireAdminAccess(request);
        if (denied) return denied;

        try {
          const url = new URL(request.url);
          const period = url.searchParams.get("period") || "30d";

          // Determine the date range based on period
          const now = new Date();
          let startDate: Date;
          let intervalDays: number;

          switch (period) {
            case "7d":
              startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              intervalDays = 1;
              break;
            case "30d":
              startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              intervalDays = 1;
              break;
            case "90d":
              startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
              intervalDays = 3;
              break;
            default:
              startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              intervalDays = 1;
          }

          // Generate date buckets
          const dataPoints: { date: string; revenue: number }[] = [];
          const currentDate = new Date(startDate);

          while (currentDate <= now) {
            const bucketEnd = new Date(currentDate);
            bucketEnd.setDate(bucketEnd.getDate() + intervalDays);

            // Get active subscriptions up to this date
            const subscriptionStats = await db
              .select({
                plan: subscriptions.plan,
                count: count(),
              })
              .from(subscriptions)
              .where(
                and(
                  lte(subscriptions.createdAt, bucketEnd),
                  sql`(${subscriptions.status} = 'active' OR ${subscriptions.currentPeriodEnd} >= ${bucketEnd})`
                )
              )
              .groupBy(subscriptions.plan);

            // Calculate MRR for this date
            let mrr = 0;
            subscriptionStats.forEach((stat) => {
              const planConfig =
                SUBSCRIPTION_PLANS[stat.plan as keyof typeof SUBSCRIPTION_PLANS];
              mrr += (planConfig?.price || 0) * stat.count;
            });

            dataPoints.push({
              date: currentDate.toISOString().split("T")[0],
              revenue: mrr,
            });

            currentDate.setDate(currentDate.getDate() + intervalDays);
          }

          // Get current MRR for comparison
          const currentSubscriptions = await db
            .select({
              plan: subscriptions.plan,
              count: count(),
            })
            .from(subscriptions)
            .where(sql`${subscriptions.status} = 'active'`)
            .groupBy(subscriptions.plan);

          let currentMrr = 0;
          currentSubscriptions.forEach((stat) => {
            const planConfig =
              SUBSCRIPTION_PLANS[stat.plan as keyof typeof SUBSCRIPTION_PLANS];
            currentMrr += (planConfig?.price || 0) * stat.count;
          });

          // Calculate previous period MRR for comparison
          const previousPeriodEnd = new Date(startDate);
          const previousPeriodStart = new Date(
            startDate.getTime() - (now.getTime() - startDate.getTime())
          );

          const previousSubscriptions = await db
            .select({
              plan: subscriptions.plan,
              count: count(),
            })
            .from(subscriptions)
            .where(
              and(
                lte(subscriptions.createdAt, previousPeriodEnd),
                gte(subscriptions.createdAt, previousPeriodStart),
                sql`${subscriptions.status} = 'active'`
              )
            )
            .groupBy(subscriptions.plan);

          let previousMrr = 0;
          previousSubscriptions.forEach((stat) => {
            const planConfig =
              SUBSCRIPTION_PLANS[stat.plan as keyof typeof SUBSCRIPTION_PLANS];
            previousMrr += (planConfig?.price || 0) * stat.count;
          });

          // Format dates for display
          const periodStart = startDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const periodEnd = now.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });

          return adminJson({
            data: dataPoints,
            currentMrr,
            previousMrr,
            periodStart,
            periodEnd,
          });
        } catch (error) {
          console.error("Revenue history error:", error);
          return adminJson(
            { error: "Failed to fetch revenue history" },
            { status: 500 }
          );
        }
      },
    },
  },
});
