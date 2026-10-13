import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, jsonBody, notFound, requireUptimeManager } from "@/lib/uptime/api";

export const Route = createFileRoute("/api/$orgSlug/uptime/subscribers/settings")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const access = await requireUptimeManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const body = await jsonBody(request);
        if (body instanceof Response) return body;
        if (Object.keys(body).length !== 1 || typeof body.subscriptionsEnabled !== "boolean") {
          return badInput("Provide subscriptionsEnabled as a boolean", "subscriptionsEnabled");
        }
        const enabled = body.subscriptionsEnabled;
        const result = await db.transaction(async (tx) => {
          // The public signup/confirmation flow and delivery worker use this
          // same row lock, so an off switch cannot race a new subscription.
          const [page] = await tx.select({ id: uptimeStatusPages.id }).from(uptimeStatusPages)
            .where(eq(uptimeStatusPages.organizationId, access.organization.id)).for("update").limit(1);
          if (!page) return null;
          await tx.update(uptimeStatusPages).set({ subscriptionsEnabled: enabled, updatedAt: new Date() })
            .where(and(eq(uptimeStatusPages.id, page.id), eq(uptimeStatusPages.organizationId, access.organization.id)));
          return { subscriptionsEnabled: enabled };
        });
        return result ? Response.json(result) : notFound("Status page");
      },
    },
  },
});
