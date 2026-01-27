import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import {
  users,
  members,
  sessions,
  accounts,
  organizations,
  tunnels,
  subdomains,
  domains,
} from "../../../db/schema";
import { redis } from "../../../lib/redis";
import { hashToken } from "../../../lib/hash";
import { eq, count, desc, and, gte, inArray } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/users/$userId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : "";
        if (!token)
          return Response.json({ error: "Unauthorized" }, { status: 401 });

        const tokenKey = `admin:token:${hashToken(token)}`;
        const exists = await redis.get(tokenKey);
        if (!exists)
          return Response.json({ error: "Forbidden" }, { status: 403 });

        try {
          const { userId } = params;

          // Get user
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          if (!user)
            return Response.json({ error: "User not found" }, { status: 404 });

          // Get user's memberships with organization details
          const membershipList = await db
            .select({
              id: members.id,
              role: members.role,
              createdAt: members.createdAt,
              organizationId: organizations.id,
              organizationName: organizations.name,
              organizationSlug: organizations.slug,
              organizationLogo: organizations.logo,
            })
            .from(members)
            .innerJoin(
              organizations,
              eq(members.organizationId, organizations.id)
            )
            .where(eq(members.userId, userId));

          // Get user's sessions (recent 10)
          const sessionList = await db
            .select({
              id: sessions.id,
              createdAt: sessions.createdAt,
              updatedAt: sessions.updatedAt,
              expiresAt: sessions.expiresAt,
              ipAddress: sessions.ipAddress,
              userAgent: sessions.userAgent,
            })
            .from(sessions)
            .where(eq(sessions.userId, userId))
            .orderBy(desc(sessions.updatedAt))
            .limit(10);

          // Get user's linked accounts
          const accountList = await db
            .select({
              id: accounts.id,
              providerId: accounts.providerId,
              createdAt: accounts.createdAt,
            })
            .from(accounts)
            .where(eq(accounts.userId, userId));

          // Get stats across all user's organizations
          const orgIds = membershipList.map((m) => m.organizationId);

          let tunnelCount = 0;
          let activeTunnelCount = 0;
          let subdomainCount = 0;
          let domainCount = 0;

          if (orgIds.length > 0) {
            const [tunnels_count] = await db
              .select({ count: count() })
              .from(tunnels)
              .where(inArray(tunnels.organizationId, orgIds));
            tunnelCount = tunnels_count?.count || 0;

            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const [active_count] = await db
              .select({ count: count() })
              .from(tunnels)
              .where(
                and(
                  inArray(tunnels.organizationId, orgIds),
                  gte(tunnels.lastSeenAt, fiveMinutesAgo)
                )
              );
            activeTunnelCount = active_count?.count || 0;

            const [subdomain_count] = await db
              .select({ count: count() })
              .from(subdomains)
              .where(inArray(subdomains.organizationId, orgIds));
            subdomainCount = subdomain_count?.count || 0;

            const [domain_count] = await db
              .select({ count: count() })
              .from(domains)
              .where(inArray(domains.organizationId, orgIds));
            domainCount = domain_count?.count || 0;
          }

          // Get last active time
          const lastSession = sessionList[0];
          const lastActive = lastSession?.updatedAt || null;

          return Response.json({
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              emailVerified: user.emailVerified,
              image: user.image,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            },
            stats: {
              organizations: membershipList.length,
              totalTunnels: tunnelCount,
              activeTunnels: activeTunnelCount,
              subdomains: subdomainCount,
              domains: domainCount,
              sessions: sessionList.length,
              lastActive,
            },
            memberships: membershipList,
            sessions: sessionList,
            accounts: accountList,
          });
        } catch (error) {
          console.error("Admin user detail error:", error);
          return Response.json(
            { error: "Failed to fetch user" },
            { status: 500 }
          );
        }
      },

      PATCH: async ({ request, params }) => {
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : "";
        if (!token)
          return Response.json({ error: "Unauthorized" }, { status: 401 });

        const tokenKey = `admin:token:${hashToken(token)}`;
        const exists = await redis.get(tokenKey);
        if (!exists)
          return Response.json({ error: "Forbidden" }, { status: 403 });

        try {
          const { userId } = params;
          const body = await request.json();

          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          if (!user)
            return Response.json({ error: "User not found" }, { status: 404 });

          // Update user fields
          const updates: Record<string, any> = {};
          if (body.name !== undefined) updates.name = body.name;
          if (body.email !== undefined) updates.email = body.email;
          if (body.emailVerified !== undefined)
            updates.emailVerified = body.emailVerified;

          if (Object.keys(updates).length > 0) {
            updates.updatedAt = new Date();
            await db.update(users).set(updates).where(eq(users.id, userId));
          }

          return Response.json({ success: true });
        } catch (error) {
          console.error("Admin user update error:", error);
          return Response.json(
            { error: "Failed to update user" },
            { status: 500 }
          );
        }
      },

      DELETE: async ({ request, params }) => {
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : "";
        if (!token)
          return Response.json({ error: "Unauthorized" }, { status: 401 });

        const tokenKey = `admin:token:${hashToken(token)}`;
        const exists = await redis.get(tokenKey);
        if (!exists)
          return Response.json({ error: "Forbidden" }, { status: 403 });

        try {
          const { userId } = params;

          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          if (!user)
            return Response.json({ error: "User not found" }, { status: 404 });

          // Delete user (cascades to sessions, accounts, members due to foreign keys)
          await db.delete(users).where(eq(users.id, userId));

          return Response.json({ success: true });
        } catch (error) {
          console.error("Admin user delete error:", error);
          return Response.json(
            { error: "Failed to delete user" },
            { status: 500 }
          );
        }
      },
    },
  },
});
