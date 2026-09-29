import { resolveCname, resolveTxt } from "node:dns/promises";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { domains } from "@/db/app-schema";
import { uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, notFound, requireUptimeManager } from "@/lib/uptime/api";

export const Route = createFileRoute("/api/$orgSlug/uptime/domains/$domainId/verify")({
  server: { handlers: {
    POST: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const [domain] = await db.select().from(domains).where(and(
        eq(domains.id, params.domainId), eq(domains.organizationId, access.organization.id),
        eq(domains.purpose, "status"),
      )).limit(1);
      if (!domain) return notFound("Status domain");
      const [page] = await db.select({ id: uptimeStatusPages.id }).from(uptimeStatusPages)
        .where(and(eq(uptimeStatusPages.organizationId, access.organization.id),
          eq(uptimeStatusPages.domainId, domain.id))).limit(1);
      if (!page) return notFound("Status page binding");
      try {
        const [txt, cname] = await Promise.all([
          resolveTxt(`_outray-challenge.${domain.domain}`),
          resolveCname(domain.domain),
        ]);
        const owns = txt.some((record) => record.join("").trim() === domain.id);
        const pointsHere = cname.some((target) => target.replace(/\.$/, "").toLowerCase() === "status.outray.app");
        if (!owns || !pointsHere) return badInput(
          "Verify the TXT ownership token and a DNS-only CNAME to status.outray.app",
          "domain",
        );
        const [active] = await db.update(domains).set({ status: "active", updatedAt: new Date() })
          .where(and(eq(domains.id, domain.id), eq(domains.organizationId, access.organization.id),
            eq(domains.purpose, "status"))).returning();
        return Response.json({ domain: active, verified: true });
      } catch {
        return badInput("DNS records are not visible yet. Verify TXT and DNS-only CNAME records", "domain");
      }
    },
  } },
});
