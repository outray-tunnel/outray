import { createFileRoute } from "@tanstack/react-router";
import { inArray } from "drizzle-orm";

import { db } from "../../../../db";
import { tunnels } from "../../../../db/app-schema";
import { redis } from "../../../../lib/redis";
import { requireOrgFromSlug } from "../../../../lib/org";

export const Route = createFileRoute("/api/$orgSlug/tunnels/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization } = orgResult;

        const onlineIds = await redis.smembers(
          `org:${organization.id}:online_tunnels`,
        );

        if (onlineIds.length === 0) {
          return Response.json({ tunnels: [] });
        }

        const dbTunnels = await db
          .select()
          .from(tunnels)
          .where(inArray(tunnels.id, onlineIds));

        const lastSeenKeys = onlineIds.map((id) => `tunnel:last_seen:${id}`);
        const lastSeenValues = await redis.mget(...lastSeenKeys);
        const lastSeenMap = new Map(
          onlineIds.map((id, i) => [id, lastSeenValues[i]]),
        );

        const result = dbTunnels.map((t) => ({
          id: t.id,
          url: t.url,
          userId: t.userId,
          name: t.name,
          protocol: t.protocol || "http",
          remotePort: t.remotePort,
          isOnline: true,
          lastSeenAt: new Date(Number(lastSeenMap.get(t.id)) || Date.now()),
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));

        return Response.json({ tunnels: result });
      },
    },
  },
});
