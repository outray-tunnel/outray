import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { domains } from "@/db/app-schema";
import { uptimeStatusPages } from "@/db/uptime-schema";
import { notFound, requireUptimeManager } from "@/lib/uptime/api";

export const Route = createFileRoute("/api/$orgSlug/uptime/domains/$domainId")({
  server: { handlers: {
    DELETE: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const [domain] = await db.select({ id: domains.id }).from(domains).where(and(
        eq(domains.id, params.domainId), eq(domains.organizationId, access.organization.id),
        eq(domains.purpose, "status"),
      )).limit(1);
      if (!domain) return notFound("Status domain");
      await db.transaction(async (tx) => {
        await tx.update(uptimeStatusPages).set({ domainId: null, updatedAt: new Date() })
          .where(and(eq(uptimeStatusPages.organizationId, access.organization.id),
            eq(uptimeStatusPages.domainId, domain.id)));
        await tx.delete(domains).where(eq(domains.id, domain.id));
      });
      return Response.json({ success: true });
    },
  } },
});
