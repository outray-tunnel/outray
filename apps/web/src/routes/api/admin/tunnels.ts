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

          // Get all online tunnel IDs from Redis using global index (O(1) lookup)
          const onlineTunnelIds = new Set<string>();
          const orgIds = await redis.smembers(
            "global:orgs_with_online_tunnels",
          );
          for (const orgId of orgIds) {
            const ids = await redis.smembers(`org:${orgId}:online_tunnels`);
            ids.forEach((id) => onlineTunnelIds.add(id));
          }

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

      // POST endpoint for cleanup of stale tunnels
      POST: async ({ request }) => {
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
          const body = (await request.json()) as { action?: string };

          if (body.action !== "cleanup") {
            return Response.json({ error: "Invalid action" }, { status: 400 });
          }

          console.log("[ADMIN] Starting stale tunnel cleanup...");
          let totalRemoved = 0;
          let totalChecked = 0;
          const removedEntries: {
            setKey: string;
            tunnelId: string;
            reason: string;
          }[] = [];

          // UUID regex pattern
          const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

          // Get all org IDs with online tunnels from global index (O(1) lookup)
          const orgIds = await redis.smembers(
            "global:orgs_with_online_tunnels",
          );

          for (const orgId of orgIds) {
            const setKey = `org:${orgId}:online_tunnels`;
            // Get all members of this set
            const members = await redis.smembers(setKey);

            for (const tunnelId of members) {
              totalChecked++;

              // Check if this is a valid UUID (dbTunnelId) or a hostname (legacy bug)
              if (!uuidPattern.test(tunnelId)) {
                // This is a hostname, not a UUID - it's a stale entry from the old bug
                await redis.srem(setKey, tunnelId);
                removedEntries.push({
                  setKey,
                  tunnelId,
                  reason: "invalid_format_hostname",
                });
                totalRemoved++;
                continue;
              }

              // Check if the tunnel:last_seen key exists (valid UUID entries)
              const lastSeenKey = `tunnel:last_seen:${tunnelId}`;
              const lastSeenExists = await redis.exists(lastSeenKey);

              if (!lastSeenExists) {
                // No last_seen key means the tunnel is offline but wasn't cleaned up
                await redis.srem(setKey, tunnelId);
                removedEntries.push({
                  setKey,
                  tunnelId,
                  reason: "missing_last_seen",
                });
                totalRemoved++;
              }
            }

            // Remove org from global index if set is now empty
            const remaining = await redis.scard(setKey);
            if (remaining === 0) {
              await redis.srem("global:orgs_with_online_tunnels", orgId);
            }
          }

          console.log(
            `[ADMIN] Cleanup complete: checked ${totalChecked} entries, removed ${totalRemoved} stale entries`,
          );

          return Response.json({
            success: true,
            checked: totalChecked,
            removed: totalRemoved,
            entries: removedEntries,
          });
        } catch (error) {
          console.error("Admin tunnel cleanup error:", error);
          return Response.json(
            { error: "Failed to cleanup tunnels" },
            { status: 500 },
          );
        }
      },
    },
  },
});
