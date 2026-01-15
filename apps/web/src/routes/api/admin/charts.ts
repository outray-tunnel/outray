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
import { sql, count, gte, desc, eq } from "drizzle-orm";
import { tigerData } from "../../../lib/tigerdata";

export const Route = createFileRoute("/api/admin/charts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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

          // User signups over time (last 30 days, daily)
          const thirtyDaysAgo = new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000,
          );
          const userSignups = await db
            .select({
              date: sql<string>`DATE(${users.createdAt})`.as("date"),
              count: count(),
            })
            .from(users)
            .where(gte(users.createdAt, thirtyDaysAgo))
            .groupBy(sql`DATE(${users.createdAt})`)
            .orderBy(sql`DATE(${users.createdAt})`);

          // Organization growth (last 30 days, daily)
          const orgGrowth = await db
            .select({
              date: sql<string>`DATE(${organizations.createdAt})`.as("date"),
              count: count(),
            })
            .from(organizations)
            .where(gte(organizations.createdAt, thirtyDaysAgo))
            .groupBy(sql`DATE(${organizations.createdAt})`)
            .orderBy(sql`DATE(${organizations.createdAt})`);

          // Subscription changes over time (last 30 days)
          const subChanges = await db
            .select({
              date: sql<string>`DATE(${subscriptions.updatedAt})`.as("date"),
              plan: subscriptions.plan,
              count: count(),
            })
            .from(subscriptions)
            .where(gte(subscriptions.updatedAt, thirtyDaysAgo))
            .groupBy(sql`DATE(${subscriptions.updatedAt})`, subscriptions.plan)
            .orderBy(sql`DATE(${subscriptions.updatedAt})`);

          // Tunnel protocol distribution
          const protocolDist = await db
            .select({
              protocol: tunnels.protocol,
              count: count(),
            })
            .from(tunnels)
            .groupBy(tunnels.protocol);

          // Hourly request activity (from TimescaleDB if available)
          let hourlyRequests: { hour: string; requests: number }[] = [];
          try {
            const result = await tigerData.query(`
              SELECT 
                time_bucket('1 hour', ts) as hour,
                SUM(active_tunnels) as requests
              FROM active_tunnel_snapshots
              WHERE ts >= NOW() - INTERVAL '24 hours'
              GROUP BY hour
              ORDER BY hour
            `);
            hourlyRequests = result.rows.map((r) => ({
              hour: r.hour,
              requests: Number(r.requests) || 0,
            }));
          } catch (e) {
            // TimescaleDB might not be available; log in non-production for debugging
            if (process.env.NODE_ENV !== "production") {
              console.error(
                "Failed to fetch hourly request activity from TimescaleDB:",
                e,
              );
            }
          }

          // User verification status
          const verificationStatus = await db
            .select({
              verified: users.emailVerified,
              count: count(),
            })
            .from(users)
            .groupBy(users.emailVerified);

          // Subscription status breakdown
          const subStatus = await db
            .select({
              status: subscriptions.status,
              count: count(),
            })
            .from(subscriptions)
            .groupBy(subscriptions.status);

          // Top organizations by tunnel count
          const topOrgsByTunnels = await db
            .select({
              orgId: tunnels.organizationId,
              orgName: organizations.name,
              tunnelCount: count(),
            })
            .from(tunnels)
            .leftJoin(
              organizations,
              eq(tunnels.organizationId, organizations.id),
            )
            .groupBy(tunnels.organizationId, organizations.name)
            .orderBy(desc(count()))
            .limit(10);

          // Weekly active tunnels trend (from TimescaleDB)
          let weeklyTunnelTrend: { day: string; avg: number; max: number }[] =
            [];
          try {
            const result = await tigerData.query(`
              SELECT 
                time_bucket('1 day', ts) as day,
                AVG(active_tunnels)::int as avg,
                MAX(active_tunnels) as max
              FROM active_tunnel_snapshots
              WHERE ts >= NOW() - INTERVAL '7 days'
              GROUP BY day
              ORDER BY day
            `);
            weeklyTunnelTrend = result.rows.map((r) => ({
              day: r.day,
              avg: Number(r.avg) || 0,
              max: Number(r.max) || 0,
            }));
          } catch (e) {
            // TimescaleDB might not be available
          }

          // Cumulative user growth
          const cumulativeUsers = await db
            .select({
              date: sql<string>`DATE(${users.createdAt})`.as("date"),
              count: count(),
            })
            .from(users)
            .groupBy(sql`DATE(${users.createdAt})`)
            .orderBy(sql`DATE(${users.createdAt})`);

          let cumulative = 0;
          const cumulativeGrowth = cumulativeUsers.map((row) => {
            cumulative += row.count;
            return { date: row.date, total: cumulative };
          });

          return Response.json({
            userSignups,
            orgGrowth,
            subChanges,
            protocolDist,
            hourlyRequests,
            verificationStatus,
            subStatus,
            topOrgsByTunnels,
            weeklyTunnelTrend,
            cumulativeGrowth: cumulativeGrowth.slice(-90), // Last 90 days
          });
        } catch (error) {
          console.error("Admin charts error:", error);
          return Response.json(
            { error: "Failed to fetch chart data" },
            { status: 500 },
          );
        }
      },
    },
  },
});
