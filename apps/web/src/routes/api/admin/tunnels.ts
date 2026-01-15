import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import { tunnels, users, organizations } from "../../../db/schema";
import { redis } from "../../../lib/redis";
import { hashToken } from "../../../lib/hash";
import { sql, count, desc, like, or, eq, inArray } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/tunnels")({
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
          const search = url.searchParams.get("search") || "";
          const protocol = url.searchParams.get("protocol") || "";
          const activeOnly = url.searchParams.get("active") === "true";
          const offset = (page - 1) * limit;

          // Get all online tunnel IDs from Redis (scan all org sets)
          const onlineTunnelIds = new Set<string>();
          let cursor = "0";
          do {
            const [nextCursor, keys] = await redis.scan(
              cursor,
              "MATCH",
              "org:*:online_tunnels",
              "COUNT",
              100,
            );
            cursor = nextCursor;
            for (const key of keys) {
              const ids = await redis.smembers(key);
              ids.forEach((id) => onlineTunnelIds.add(id));
            }
          } while (cursor !== "0");

          // Build conditions
          const conditions = [];

          if (search) {
            conditions.push(
              or(
                like(tunnels.url, `%${search}%`),
                like(tunnels.name, `%${search}%`),
              ),
            );
          }

          if (protocol) {
            conditions.push(eq(tunnels.protocol, protocol));
          }

          if (activeOnly) {
            if (onlineTunnelIds.size === 0) {
              // No online tunnels, return empty
              return Response.json({
                tunnels: [],
                total: 0,
                page,
                totalPages: 0,
                stats: {
                  total: 0,
                  active: 0,
                  byProtocol: {},
                },
              });
            }
            conditions.push(inArray(tunnels.id, Array.from(onlineTunnelIds)));
          }

          const whereClause =
            conditions.length > 0
              ? sql`${sql.join(
                  conditions.map((c) => sql`(${c})`),
                  sql` AND `,
                )}`
              : undefined;

          // Get total count
          const countQuery = db.select({ count: count() }).from(tunnels);

          const [totalResult] = whereClause
            ? await countQuery.where(whereClause)
            : await countQuery;

          // Get tunnels with user and org info
          const tunnelQuery = db
            .select({
              id: tunnels.id,
              url: tunnels.url,
              name: tunnels.name,
              protocol: tunnels.protocol,
              remotePort: tunnels.remotePort,
              lastSeenAt: tunnels.lastSeenAt,
              createdAt: tunnels.createdAt,
              userName: users.name,
              userEmail: users.email,
              orgName: organizations.name,
              orgSlug: organizations.slug,
            })
            .from(tunnels)
            .leftJoin(users, eq(tunnels.userId, users.id))
            .leftJoin(
              organizations,
              eq(tunnels.organizationId, organizations.id),
            )
            .orderBy(desc(tunnels.lastSeenAt))
            .limit(limit)
            .offset(offset);

          const tunnelList = whereClause
            ? await tunnelQuery.where(whereClause)
            : await tunnelQuery;

          // Add isOnline status based on Redis
          const tunnelsWithStatus = tunnelList.map((tunnel) => ({
            ...tunnel,
            isOnline: onlineTunnelIds.has(tunnel.id),
          }));

          // Get protocol distribution (all tunnels)
          const protocolStats = await db
            .select({
              protocol: tunnels.protocol,
              count: count(),
            })
            .from(tunnels)
            .groupBy(tunnels.protocol);

          return Response.json({
            tunnels: tunnelsWithStatus,
            total: totalResult.count,
            page,
            totalPages: Math.ceil(totalResult.count / limit),
            stats: {
              total: totalResult.count,
              active: onlineTunnelIds.size,
              byProtocol: Object.fromEntries(
                protocolStats.map((p) => [p.protocol, p.count]),
              ),
            },
          });
        } catch (error) {
          console.error("Admin tunnels error:", error);
          return Response.json(
            { error: "Failed to fetch tunnels" },
            { status: 500 },
          );
        }
      },
    },
  },
});
