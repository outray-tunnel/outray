import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { db } from "../../../db";
import { users, members, sessions } from "../../../db/schema";
import { redis } from "../../../lib/redis";
import { sql, count, desc, like, or, eq } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Admin token check
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length)
          : "";

        if (!token) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const tokenKey = `admin:token:${token}`;
        const exists = await redis.get(tokenKey);
        if (!exists) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        try {
          const url = new URL(request.url);
          const page = parseInt(url.searchParams.get("page") || "1");
          const limit = parseInt(url.searchParams.get("limit") || "20");
          const search = url.searchParams.get("search") || "";
          const offset = (page - 1) * limit;

          // Build search condition
          const searchCondition = search
            ? or(
                like(users.email, `%${search}%`),
                like(users.name, `%${search}%`)
              )
            : undefined;

          // Get total count
          const [totalResult] = await db
            .select({ count: count() })
            .from(users)
            .where(searchCondition);

          // Get users with org count
          const userList = await db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              emailVerified: users.emailVerified,
              image: users.image,
              createdAt: users.createdAt,
            })
            .from(users)
            .where(searchCondition)
            .orderBy(desc(users.createdAt))
            .limit(limit)
            .offset(offset);

          // Get org counts for each user
          const userIds = userList.map((u) => u.id);
          const orgCounts =
            userIds.length > 0
              ? await db
                  .select({
                    userId: members.userId,
                    count: count(),
                  })
                  .from(members)
                  .where(sql`${members.userId} IN ${userIds}`)
                  .groupBy(members.userId)
              : [];

          const orgCountMap = new Map(
            orgCounts.map((oc) => [oc.userId, oc.count])
          );

          // Get last active (most recent session) for each user
          const lastActiveSessions =
            userIds.length > 0
              ? await db
                  .select({
                    userId: sessions.userId,
                    lastActive: sql<Date>`MAX(${sessions.updatedAt})`.as(
                      "lastActive"
                    ),
                  })
                  .from(sessions)
                  .where(sql`${sessions.userId} IN ${userIds}`)
                  .groupBy(sessions.userId)
              : [];

          const lastActiveMap = new Map(
            lastActiveSessions.map((s) => [s.userId, s.lastActive])
          );

          const usersWithMeta = userList.map((user) => ({
            ...user,
            orgCount: orgCountMap.get(user.id) || 0,
            lastActive: lastActiveMap.get(user.id) || null,
          }));

          return json({
            users: usersWithMeta,
            total: totalResult.count,
            page,
            totalPages: Math.ceil(totalResult.count / limit),
          });
        } catch (error) {
          console.error("Admin users error:", error);
          return json({ error: "Failed to fetch users" }, { status: 500 });
        }
      },
    },
  },
});
