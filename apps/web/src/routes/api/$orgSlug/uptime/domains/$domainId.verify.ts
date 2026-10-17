import { resolveCname, resolveTxt } from "node:dns/promises";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { domains } from "@/db/app-schema";
import { badInput, findStatusPage, notFound, requireUptimeManager } from "@/lib/uptime/api";
import { statusDnsTarget } from "@/lib/uptime/domain-config";
import {
  ensureCustomStatusHostname,
  statusDomainProviderResponse,
} from "@/lib/uptime/status-domain-provider.server";

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
      const page = await findStatusPage(access.organization.id, request);
      if (!page || page.domainId !== domain.id) return notFound("Status page binding");
      try {
        const [txt, cname] = await Promise.all([
          resolveTxt(`_outray-challenge.${domain.domain}`),
          resolveCname(domain.domain),
        ]);
        const owns = txt.some((record) => record.join("").trim() === domain.id);
        const cnameTarget = statusDnsTarget();
        const pointsHere = cname.some((target) => target.replace(/\.$/, "").toLowerCase() === cnameTarget);
        if (!owns || !pointsHere) return badInput(
          `Verify the TXT ownership token and a DNS-only CNAME to ${cnameTarget}`,
          "domain",
        );
      } catch {
        return badInput("DNS records are not visible yet. Verify TXT and DNS-only CNAME records", "domain");
      }

      let provisioning;
      try {
        provisioning = await ensureCustomStatusHostname({
          hostname: domain.domain,
          domainId: domain.id,
          providerId: domain.providerId,
          persistProviderResource: async (resource) => {
            await db.update(domains).set({
              status: resource.providerStatus === "failed" ? "failed" : "pending",
              providerId: resource.providerId,
              providerStatus: resource.providerStatus,
              updatedAt: new Date(),
            }).where(and(
              eq(domains.id, domain.id),
              eq(domains.organizationId, access.organization.id),
              eq(domains.purpose, "status"),
            ));
          },
        });
      } catch (error) {
        return statusDomainProviderResponse(error);
      }

      const nextStatus = provisioning
        ? provisioning.ready ? "active" : provisioning.failed ? "failed" : "pending"
        : "active";
      const [updated] = await db.update(domains).set({
        status: nextStatus,
        ...(provisioning ? {
          providerId: provisioning.providerId,
          providerStatus: provisioning.providerStatus,
        } : {}),
        updatedAt: new Date(),
      }).where(and(
        eq(domains.id, domain.id),
        eq(domains.organizationId, access.organization.id),
        eq(domains.purpose, "status"),
      )).returning();

      if (provisioning?.failed) {
        return Response.json({ error: "Status domain certificate provisioning failed" }, { status: 503 });
      }
      return Response.json({
        domain: updated,
        verified: true,
        provisioning: Boolean(provisioning && !provisioning.ready),
      }, { status: provisioning && !provisioning.ready ? 202 : 200 });
    },
  } },
});
