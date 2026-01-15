import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import {
  organizations,
  members,
  tunnels,
  subscriptions,
} from "../../../db/schema";
import { redis } from "../../../lib/redis";
import { hashToken } from "../../../lib/hash";
import { count, desc, like, or, inArray, gte, and } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/organizations")({
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
          const pageParam = parseInt(url.searchParams.get("page") || "1");
          const limitParam = parseInt(url.searchParams.get("limit") || "20");
          const page = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
          const limit =
            Number.isNaN(limitParam) || limitParam < 1
              ? 20
              : Math.min(limitParam, 100);
          const search = url.searchParams.get("search") || "";
          const offset = (page - 1) * limit;

          // Build search condition
          const searchCondition = search
            ? or(
                like(organizations.name, `%${search}%`),
                like(organizations.slug, `%${search}%`),
              )
            : undefined;

          // Get total count
          const [totalResult] = await db
            .select({ count: count() })
            .from(organizations)
            .where(searchCondition);

          // Get organizations
          const orgList = await db
            .select({
              id: organizations.id,
              name: organizations.name,
              slug: organizations.slug,
              logo: organizations.logo,
              createdAt: organizations.createdAt,
            })
            .from(organizations)
            .where(searchCondition)
            .orderBy(desc(organizations.createdAt))
            .limit(limit)
            .offset(offset);

          const orgIds = orgList.map((o) => o.id);

          // Get member counts
          const memberCounts =
            orgIds.length > 0
              ? await db
                  .select({
                    organizationId: members.organizationId,
                    count: count(),
                  })
                  .from(members)
                  .where(inArray(members.organizationId, orgIds))
                  .groupBy(members.organizationId)
              : [];

          const memberCountMap = new Map(
            memberCounts.map((mc) => [mc.organizationId, mc.count]),
          );

          // Get tunnel counts (active tunnels - seen in last 5 minutes)
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          const tunnelCounts =
            orgIds.length > 0
              ? await db
                  .select({
                    organizationId: tunnels.organizationId,
                    count: count(),
                  })
                  .from(tunnels)
                  .where(
                    and(
                      inArray(tunnels.organizationId, orgIds),
                      gte(tunnels.lastSeenAt, fiveMinutesAgo),
                    ),
                  )
                  .groupBy(tunnels.organizationId)
              : [];

          const tunnelCountMap = new Map(
            tunnelCounts.map((tc) => [tc.organizationId, tc.count]),
          );

          // Get subscription plans
          const subscriptionPlans =
            orgIds.length > 0
              ? await db
                  .select({
                    organizationId: subscriptions.organizationId,
                    plan: subscriptions.plan,
                    status: subscriptions.status,
                  })
                  .from(subscriptions)
                  .where(inArray(subscriptions.organizationId, orgIds))
              : [];

          const subscriptionMap = new Map(
            subscriptionPlans.map((s) => [
              s.organizationId,
              { plan: s.plan, status: s.status },
            ]),
          );

          const orgsWithMeta = orgList.map((org) => ({
            ...org,
            memberCount: memberCountMap.get(org.id) || 0,
            activeTunnels: tunnelCountMap.get(org.id) || 0,
            subscription: subscriptionMap.get(org.id) || {
              plan: "free",
              status: "active",
            },
          }));

          return Response.json({
            organizations: orgsWithMeta,
            total: totalResult.count,
            page,
            totalPages: Math.ceil(totalResult.count / limit),
          });
        } catch (error) {
          console.error("Admin organizations error:", error);
          return Response.json(
            { error: "Failed to fetch organizations" },
            { status: 500 },
          );
        }
      },
    },
  },
});
