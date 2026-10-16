import { createFileRoute } from "@tanstack/react-router";
import { adminJson, requireAdminAccess } from "../../../lib/admin-access.server";
import { db } from "../../../db";
import { users, members, sessions } from "../../../db/schema";
import { sql, desc, like, or, inArray } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await requireAdminAccess(request);
        if (denied) return denied;

        try {
          const url = new URL(request.url);
          const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
          const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20") || 20));
          const search = url.searchParams.get("search") || "";
          const offset = (page - 1) * limit;

          // Build search condition
          const searchCondition = search
            ? or(
                like(users.email, `%${search}%`),
                like(users.name, `%${search}%`)
              )
            : sql`1=1`;

          // Get total count
          const [totalResult] = await db
            .select({ count: sql<number>`cast(count(${users.id}) as integer)` })
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
                    count: sql<number>`cast(count(${members.userId}) as integer)`,
                  })
                  .from(members)
                  .where(inArray(members.userId, userIds))
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
                  .where(inArray(sessions.userId, userIds))
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

          return adminJson({
            users: usersWithMeta,
            total: totalResult.count,
            page,
            totalPages: Math.ceil(totalResult.count / limit),
          });
        } catch (error) {
          console.error("Admin users error:", error);
          return adminJson({ error: "Failed to fetch users" }, { status: 500 });
        }
      },
    },
  },
});
