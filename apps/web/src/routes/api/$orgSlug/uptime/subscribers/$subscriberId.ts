import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { uptimeStatusPages, uptimeSubscribers } from "@/db/uptime-schema";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { serializeSubscriber } from "@/lib/uptime/subscriber-api";

export const Route = createFileRoute("/api/$orgSlug/uptime/subscribers/$subscriberId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const access = await requireUptimeManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const body = await jsonBody(request);
        if (body instanceof Response) return body;
        if (Object.keys(body).length !== 1 || body.status !== "unsubscribed") {
          return badInput("Subscribers may only be unsubscribed", "status");
        }
        const result = await db.transaction(async (tx) => {
          const [page] = await tx.select({ id: uptimeStatusPages.id }).from(uptimeStatusPages)
            .where(eq(uptimeStatusPages.organizationId, access.organization.id)).for("update").limit(1);
          if (!page) return null;
          const scope = and(eq(uptimeSubscribers.id, params.subscriberId),
            eq(uptimeSubscribers.pageId, page.id), eq(uptimeSubscribers.organizationId, access.organization.id));
          const [subscriber] = await tx.select().from(uptimeSubscribers).where(scope).limit(1);
          if (!subscriber) return null;
          const now = new Date();
          const [updated] = await tx.update(uptimeSubscribers).set({ status: "unsubscribed",
            unsubscribedAt: subscriber.unsubscribedAt ?? now, tokenHash: null,
            tokenExpiresAt: null, updatedAt: now }).where(scope).returning();
          return serializeSubscriber(updated);
        });
        return result ? Response.json({ subscriber: result }) : notFound("Subscriber");
      },
    },
  },
});
