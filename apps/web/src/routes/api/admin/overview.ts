import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import {
  users,
  organizations,
  tunnels,
  subscriptions,
} from "../../../db/schema";
import { redis } from "../../../lib/redis";
import { hashToken } from "../../../lib/hash";
import { SUBSCRIPTION_PLANS } from "../../../lib/subscription-plans";
import { sql, count, gte, and } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/overview")({
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
          const now = new Date();
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          // Get user stats
          const [totalUsers] = await db.select({ count: count() }).from(users);

          const [newUsersToday] = await db
            .select({ count: count() })
            .from(users)
            .where(gte(users.createdAt, oneDayAgo));

          const [newUsersLastWeek] = await db
            .select({ count: count() })
            .from(users)
            .where(
              and(
                gte(users.createdAt, oneWeekAgo),
                sql`${users.createdAt} < ${oneDayAgo}`,
              ),
            );

          // Calculate user growth (comparing today vs same period last week)
          const userGrowth =
            newUsersLastWeek.count > 0
              ? ((newUsersToday.count - newUsersLastWeek.count / 7) /
                  (newUsersLastWeek.count / 7)) *
                100
              : 0;

          // Get organization stats
          const [totalOrgs] = await db
            .select({ count: count() })
            .from(organizations);

          const [newOrgsToday] = await db
            .select({ count: count() })
            .from(organizations)
            .where(gte(organizations.createdAt, oneDayAgo));

          const [newOrgsLastWeek] = await db
            .select({ count: count() })
            .from(organizations)
            .where(
              and(
                gte(organizations.createdAt, oneWeekAgo),
                sql`${organizations.createdAt} < ${oneDayAgo}`,
              ),
            );

          const orgGrowth =
            newOrgsLastWeek.count > 0
              ? ((newOrgsToday.count - newOrgsLastWeek.count / 7) /
                  (newOrgsLastWeek.count / 7)) *
                100
              : 0;

          // Get tunnel stats
          const [totalTunnels] = await db
            .select({ count: count() })
            .from(tunnels);

          // Get active tunnels from Redis using global index (O(1) lookup)
          let activeTunnelCount = 0;
          const orgIds = await redis.smembers(
            "global:orgs_with_online_tunnels",
          );
          for (const orgId of orgIds) {
            const count = await redis.scard(`org:${orgId}:online_tunnels`);
            activeTunnelCount += count;
          }

          // Get subscription stats
          const subscriptionStats = await db
            .select({
              plan: subscriptions.plan,
              count: count(),
            })
            .from(subscriptions)
            .where(sql`${subscriptions.status} = 'active'`)
            .groupBy(subscriptions.plan);

          // Count orgs with subscriptions
          const [orgsWithSubs] = await db
            .select({ count: count() })
            .from(subscriptions);

          const byPlan: Record<string, number> = {
            free: 0,
            ray: 0,
            beam: 0,
            pulse: 0,
          };

          subscriptionStats.forEach((stat) => {
            byPlan[stat.plan] = stat.count;
          });

          // Orgs without subscription records are considered "free"
          const orgsWithoutSubs = totalOrgs.count - orgsWithSubs.count;
          byPlan.free += orgsWithoutSubs;

          // Calculate MRR using actual plan prices
          const mrr = Object.entries(byPlan).reduce(
            (total, [plan, planCount]) => {
              const planConfig =
                SUBSCRIPTION_PLANS[plan as keyof typeof SUBSCRIPTION_PLANS];
              return total + (planConfig?.price || 0) * planCount;
            },
            0,
          );

          return Response.json({
            users: {
              total: totalUsers.count,
              growth: Math.round(userGrowth * 10) / 10,
              newToday: newUsersToday.count,
            },
            organizations: {
              total: totalOrgs.count,
              growth: Math.round(orgGrowth * 10) / 10,
            },
            tunnels: {
              active: activeTunnelCount,
              total: totalTunnels.count,
            },
            subscriptions: {
              byPlan,
              mrr,
            },
          });
        } catch (error) {
          console.error("Admin overview error:", error);
          return Response.json(
            { error: "Failed to fetch overview" },
            { status: 500 },
          );
        }
      },
    },
  },
});
