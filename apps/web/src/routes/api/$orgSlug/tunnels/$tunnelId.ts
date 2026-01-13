import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { tunnels } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";
import { redis } from "../../../../lib/redis";

export const Route = createFileRoute("/api/$orgSlug/tunnels/$tunnelId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { orgSlug, tunnelId } = params;

        const orgContext = await requireOrgFromSlug(request, orgSlug);
        if ("error" in orgContext) {
          return orgContext.error;
        }

        const [tunnel] = await db
          .select()
          .from(tunnels)
          .where(eq(tunnels.id, tunnelId));

        if (!tunnel) {
          return Response.json({ error: "Tunnel not found" }, { status: 404 });
        }

        if (tunnel.organizationId !== orgContext.organization.id) {
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        }

        let onlineTunnelId = "";
        const protocol = tunnel.protocol || "http";

        if (protocol === "tcp" || protocol === "udp") {
          try {
            const urlObj = new URL(tunnel.url);
            const hostParts = urlObj.hostname.split(".");
            onlineTunnelId = hostParts[0];
          } catch (e) {
            console.error("Failed to parse tunnel URL:", tunnel.url);
          }
        } else {
          try {
            const urlObj = new URL(
              tunnel.url.startsWith("http")
                ? tunnel.url
                : `https://${tunnel.url}`,
            );
            onlineTunnelId = urlObj.hostname;
          } catch (e) {
            console.error("Failed to parse tunnel URL:", tunnel.url);
          }
        }

        const isOnline = onlineTunnelId
          ? await redis.exists(`tunnel:online:${onlineTunnelId}`)
          : false;

        return Response.json({
          tunnel: {
            id: tunnel.id,
            url: tunnel.url,
            userId: tunnel.userId,
            name: tunnel.name,
            protocol,
            remotePort: tunnel.remotePort,
            isOnline: !!isOnline,
            lastSeenAt: tunnel.lastSeenAt,
            createdAt: tunnel.createdAt,
            updatedAt: tunnel.updatedAt,
          },
        });
      },
    },
  },
});
