import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import { organizations, members, subscriptions, tunnels, subdomains, domains, users } from "../../../db/schema";
import { redis } from "../../../lib/redis";
import { hashToken } from "../../../lib/hash";
import { eq, count, gte, and, desc } from "drizzle-orm";

export const Route = createFileRoute("/api/admin/organizations/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const tokenKey = `admin:token:${hashToken(token)}`;
        const exists = await redis.get(tokenKey);
        if (!exists) return Response.json({ error: "Forbidden" }, { status: 403 });

        try {
          const { slug } = params;
          const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
          if (!org) return Response.json({ error: "Organization not found" }, { status: 404 });

          const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, org.id)).limit(1);
          const [memberCount] = await db.select({ count: count() }).from(members).where(eq(members.organizationId, org.id));
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          const [activeTunnelCount] = await db.select({ count: count() }).from(tunnels)
            .where(and(eq(tunnels.organizationId, org.id), gte(tunnels.lastSeenAt, fiveMinutesAgo)));
          const [totalTunnelCount] = await db.select({ count: count() }).from(tunnels).where(eq(tunnels.organizationId, org.id));
          const [subdomainCount] = await db.select({ count: count() }).from(subdomains).where(eq(subdomains.organizationId, org.id));
          const [domainCount] = await db.select({ count: count() }).from(domains).where(eq(domains.organizationId, org.id));

          const memberList = await db.select({
            id: members.id,
            userId: members.userId,
            role: members.role,
            createdAt: members.createdAt,
            userName: users.name,
            userEmail: users.email,
            userImage: users.image,
          }).from(members)
            .innerJoin(users, eq(members.userId, users.id))
            .where(eq(members.organizationId, org.id));

          // Find the owner
          const owner = memberList.find(m => m.role === "owner") || memberList[0];

          // Get tunnels list
          const tunnelList = await db.select({
            id: tunnels.id,
            url: tunnels.url,
            name: tunnels.name,
            protocol: tunnels.protocol,
            remotePort: tunnels.remotePort,
            lastSeenAt: tunnels.lastSeenAt,
            createdAt: tunnels.createdAt,
            userId: tunnels.userId,
            userName: users.name,
            userEmail: users.email,
          }).from(tunnels)
            .innerJoin(users, eq(tunnels.userId, users.id))
            .where(eq(tunnels.organizationId, org.id))
            .orderBy(desc(tunnels.lastSeenAt));

          // Get subdomains list
          const subdomainList = await db.select({
            id: subdomains.id,
            subdomain: subdomains.subdomain,
            createdAt: subdomains.createdAt,
            userId: subdomains.userId,
            userName: users.name,
            userEmail: users.email,
          }).from(subdomains)
            .innerJoin(users, eq(subdomains.userId, users.id))
            .where(eq(subdomains.organizationId, org.id))
            .orderBy(desc(subdomains.createdAt));

          // Get domains list
          const domainList = await db.select({
            id: domains.id,
            domain: domains.domain,
            status: domains.status,
            createdAt: domains.createdAt,
            updatedAt: domains.updatedAt,
            userId: domains.userId,
            userName: users.name,
            userEmail: users.email,
          }).from(domains)
            .innerJoin(users, eq(domains.userId, users.id))
            .where(eq(domains.organizationId, org.id))
            .orderBy(desc(domains.createdAt));

          return Response.json({
            organization: org,
            subscription: sub || { plan: "free", status: "active" },
            owner: owner ? {
              id: owner.userId,
              name: owner.userName,
              email: owner.userEmail,
              image: owner.userImage,
            } : null,
            stats: {
              members: memberCount.count,
              activeTunnels: activeTunnelCount.count,
              totalTunnels: totalTunnelCount.count,
              subdomains: subdomainCount.count,
              domains: domainCount.count,
            },
            members: memberList,
            tunnels: tunnelList,
            subdomains: subdomainList,
            domains: domainList,
          });
        } catch (error) {
          console.error("Admin org detail error:", error);
          return Response.json({ error: "Failed to fetch organization" }, { status: 500 });
        }
      },

      PATCH: async ({ request, params }) => {
        const authHeader = request.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const tokenKey = `admin:token:${hashToken(token)}`;
        const exists = await redis.get(tokenKey);
        if (!exists) return Response.json({ error: "Forbidden" }, { status: 403 });

        try {
          const { slug } = params;
          const body = await request.json();
          const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
          if (!org) return Response.json({ error: "Organization not found" }, { status: 404 });

          // Update organization fields
          if (body.name || body.slug) {
            await db.update(organizations).set({
              ...(body.name && { name: body.name }),
              ...(body.slug && { slug: body.slug }),
            }).where(eq(organizations.id, org.id));
          }

          // Update subscription
          if (body.plan || body.status) {
            const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, org.id)).limit(1);
            if (existingSub) {
              await db.update(subscriptions).set({
                ...(body.plan && { plan: body.plan }),
                ...(body.status && { status: body.status }),
                updatedAt: new Date(),
              }).where(eq(subscriptions.organizationId, org.id));
            } else {
              await db.insert(subscriptions).values({
                id: crypto.randomUUID(),
                organizationId: org.id,
                plan: body.plan || "free",
                status: body.status || "active",
              });
            }
          }

          return Response.json({ success: true });
        } catch (error) {
          console.error("Admin org update error:", error);
          return Response.json({ error: "Failed to update organization" }, { status: 500 });
        }
      },
    },
  },
});
