import { createFileRoute } from "@tanstack/react-router";
import { adminJson, requireAdminAccess } from "../../../lib/admin-access.server";
import { db } from "../../../db";
import { organizations, members, subscriptions, tunnels, subdomains, domains, users } from "../../../db/schema";
import { redis } from "../../../lib/redis";
import { eq, count, gte, and, desc } from "drizzle-orm";
import { generateEmail } from "../../../email/templates";
import { sendViaZepto } from "../../../lib/send-email";

export const Route = createFileRoute("/api/admin/organizations/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = await requireAdminAccess(request);
        if (denied) return denied;

        try {
          const { slug } = params;
          const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
          if (!org) return adminJson({ error: "Organization not found" }, { status: 404 });

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

          return adminJson({
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
          return adminJson({ error: "Failed to fetch organization" }, { status: 500 });
        }
      },

      PATCH: async ({ request, params }) => {
        const denied = await requireAdminAccess(request);
        if (denied) return denied;

        try {
          const { slug } = params;
          const body = await request.json();
          const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
          if (!org) return adminJson({ error: "Organization not found" }, { status: 404 });

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
            const newPlan = body.plan || existingSub?.plan || "free";
            
            if (newPlan === "free") {
              // Delete subscription when downgrading to free
              if (existingSub) {
                await db.delete(subscriptions).where(eq(subscriptions.organizationId, org.id));
              }
            } else if (existingSub) {
              // Update existing subscription
              await db.update(subscriptions).set({
                plan: newPlan,
                status: body.status || "active",
                updatedAt: new Date(),
              }).where(eq(subscriptions.organizationId, org.id));
            } else {
              // Create new subscription for paid plan
              await db.insert(subscriptions).values({
                id: crypto.randomUUID(),
                organizationId: org.id,
                plan: newPlan,
                status: body.status || "active",
              });
            }
          }

          return adminJson({ success: true });
        } catch (error) {
          console.error("Admin org update error:", error);
          return adminJson({ error: "Failed to update organization" }, { status: 500 });
        }
      },

      POST: async ({ request, params }) => {
        const denied = await requireAdminAccess(request);
        if (denied) return denied;

        try {
          const { slug } = params;
          const body = await request.json();
          
          if (body.action === "reset_to_free") {
            const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
            if (!org) return adminJson({ error: "Organization not found" }, { status: 404 });

            // Get the current subscription to know the previous plan
            const [currentSub] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, org.id)).limit(1);
            const previousPlan = currentSub?.plan || "free";

            // Find the owner of the organization
            const [owner] = await db.select({
              userId: members.userId,
              userName: users.name,
              userEmail: users.email,
            })
              .from(members)
              .innerJoin(users, eq(members.userId, users.id))
              .where(and(eq(members.organizationId, org.id), eq(members.role, "owner")))
              .limit(1);

            // 1. Delete subscription
            await db.delete(subscriptions).where(eq(subscriptions.organizationId, org.id));

            // 2. Remove paid tunnel domains only. Status-page domains have an
            // independent lifecycle and may own external provider resources.
            await db.delete(domains).where(and(
              eq(domains.organizationId, org.id),
              eq(domains.purpose, "tunnel"),
            ));

            // 3. Get all subdomains and keep only the oldest one
            const orgSubdomains = await db.select()
              .from(subdomains)
              .where(eq(subdomains.organizationId, org.id))
              .orderBy(subdomains.createdAt);

            if (orgSubdomains.length > 1) {
              // Keep the first (oldest) subdomain, delete the rest
              const subdomainsToDelete = orgSubdomains.slice(1).map(s => s.id);
              for (const subId of subdomainsToDelete) {
                await db.delete(subdomains).where(eq(subdomains.id, subId));
              }
            }

            // 4. Get all tunnels and keep only the two oldest (free plan allows 2)
            const orgTunnels = await db.select()
              .from(tunnels)
              .where(eq(tunnels.organizationId, org.id))
              .orderBy(tunnels.createdAt);

            let tunnelsDeleted = 0;
            if (orgTunnels.length > 2) {
              // Keep the first 2 (oldest) tunnels, delete the rest
              const tunnelsToDelete = orgTunnels.slice(2);
              for (const tunnel of tunnelsToDelete) {
                await db.delete(tunnels).where(eq(tunnels.id, tunnel.id));
                
                // Extract tunnel identifier for kill command (matching dashboard logic)
                let tunnelIdentifier = tunnel.url;
                try {
                  const protocol = tunnel.protocol || "http";
                  if (protocol === "tcp" || protocol === "udp") {
                    const urlObj = new URL(tunnel.url.replace(/^(tcp|udp):/, "https:"));
                    tunnelIdentifier = urlObj.hostname.split(".")[0];
                  } else {
                    const urlObj = new URL(
                      tunnel.url.startsWith("http") ? tunnel.url : `https://${tunnel.url}`
                    );
                    tunnelIdentifier = urlObj.hostname;
                  }
                } catch (e) {
                  // ignore parse errors
                }
                
                await redis.publish("tunnel:control", `kill:${tunnelIdentifier}`);
              }
              tunnelsDeleted = tunnelsToDelete.length;
            }

            // 5. Send email to the owner
            if (owner?.userEmail && previousPlan !== "free") {
              try {
                const { html, subject } = generateEmail("subscription-reset", {
                  name: owner.userName || "there",
                  organizationName: org.name,
                  previousPlan: previousPlan.charAt(0).toUpperCase() + previousPlan.slice(1),
                  dashboardUrl: `${process.env.APP_URL}/${org.slug}/settings`,
                });

                await sendViaZepto({
                  recipientEmail: owner.userEmail,
                  subject,
                  htmlString: html,
                });
                console.log(`[Subscription Reset Email] Sent to: ${owner.userEmail}`);
              } catch (emailError) {
                console.error("[Subscription Reset Email] Failed to send:", emailError);
              }
            }

            return adminJson({
              success: true, 
              message: "Organization reset to free plan",
              deleted: {
                domains: "all",
                subdomains: orgSubdomains.length > 1 ? orgSubdomains.length - 1 : 0,
                tunnels: tunnelsDeleted,
              }
            });
          }

          return adminJson({ error: "Unknown action" }, { status: 400 });
        } catch (error) {
          console.error("Admin org action error:", error);
          return adminJson({ error: "Failed to perform action" }, { status: 500 });
        }
      },
    },
  },
});
