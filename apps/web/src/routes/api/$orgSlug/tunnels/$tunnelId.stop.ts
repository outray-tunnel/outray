import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { tunnels } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";
import { redis } from "../../../../lib/redis";

export const Route = createFileRoute("/api/$orgSlug/tunnels/$tunnelId/stop")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
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

        let tunnelIdentifier = tunnel.url;
        try {
          const protocol = tunnel.protocol || "http";

          if (protocol === "tcp" || protocol === "udp") {
            const urlObj = new URL(tunnel.url.replace(/^(tcp|udp):/, "https:"));
            const hostname = urlObj.hostname;
            tunnelIdentifier = hostname.split(".")[0];
          } else {
            const urlObj = new URL(
              tunnel.url.startsWith("http")
                ? tunnel.url
                : `https://${tunnel.url}`,
            );
            tunnelIdentifier = urlObj.hostname;
          }
        } catch (e) {
          // ignore parse errors
        }

        await redis.publish("tunnel:control", `kill:${tunnelIdentifier}`);

        return Response.json({ message: "Tunnel stopped" });
      },
    },
  },
});
