import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { domains } from "@/db/app-schema";
import { uptimeStatusPages } from "@/db/uptime-schema";
import { findStatusPage, notFound, requireUptimeManager } from "@/lib/uptime/api";
import {
  removeCustomStatusHostname,
  statusDomainProviderEnabled,
  statusDomainProviderResponse,
} from "@/lib/uptime/status-domain-provider.server";

export const Route = createFileRoute("/api/$orgSlug/uptime/domains/$domainId")({
  server: { handlers: {
    DELETE: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const [domain] = await db.select().from(domains).where(and(
        eq(domains.id, params.domainId), eq(domains.organizationId, access.organization.id),
        eq(domains.purpose, "status"),
      )).limit(1);
      if (!domain) return notFound("Status domain");
      const page = await findStatusPage(access.organization.id, request);
      if (!page || page.domainId !== domain.id) return notFound("Status domain");

      let providerEnabled: boolean;
      try {
        providerEnabled = statusDomainProviderEnabled();
      } catch (error) {
        return statusDomainProviderResponse(error);
      }

      if (!providerEnabled) {
        await db.transaction(async (tx) => {
          await tx.update(uptimeStatusPages).set({ domainId: null, updatedAt: new Date() })
            .where(and(eq(uptimeStatusPages.id, page.id), eq(uptimeStatusPages.organizationId, access.organization.id),
              eq(uptimeStatusPages.domainId, domain.id)));
          await tx.delete(domains).where(and(eq(domains.id, domain.id),
            eq(domains.organizationId, access.organization.id), eq(domains.purpose, "status")));
        });
      } else {
        // Stop public routing before calling the provider, but keep the page
        // binding so the dashboard can retry a failed provider deletion and
        // cannot attach a second domain in the meantime.
        await db.update(domains).set({ status: "deleting", providerStatus: "deleting", updatedAt: new Date() })
          .where(and(eq(domains.id, domain.id), eq(domains.organizationId, access.organization.id),
            eq(domains.purpose, "status")));
      }

      if (providerEnabled) {
        try {
          await removeCustomStatusHostname({
            hostname: domain.domain,
            domainId: domain.id,
            providerId: domain.providerId,
          });
        } catch (error) {
          // The domain is no longer publicly active, but its row and page
          // binding remain so an authorized retry can finish the removal.
          return statusDomainProviderResponse(error);
        }
        await db.transaction(async (tx) => {
          await tx.update(uptimeStatusPages).set({ domainId: null, updatedAt: new Date() })
            .where(and(eq(uptimeStatusPages.id, page.id), eq(uptimeStatusPages.organizationId, access.organization.id),
              eq(uptimeStatusPages.domainId, domain.id)));
          await tx.delete(domains).where(and(eq(domains.id, domain.id),
            eq(domains.organizationId, access.organization.id), eq(domains.purpose, "status")));
        });
      }
      return Response.json({ success: true });
    },
  } },
});
