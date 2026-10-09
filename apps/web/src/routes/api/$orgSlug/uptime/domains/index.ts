import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { domains } from "@/db/app-schema";
import { organizations } from "@/db/auth-schema";
import { uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, jsonBody, requireUptimeManager, requireUptimeRead } from "@/lib/uptime/api";
import { isReservedStatusCustomDomain, statusDnsTarget } from "@/lib/uptime/domain-config";

const domainPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export const Route = createFileRoute("/api/$orgSlug/uptime/domains/")({
  server: { handlers: {
    GET: async ({ request, params }) => {
      const access = await requireUptimeRead(request, params.orgSlug);
      if ("error" in access) return access.error;
      const [row] = await db.select().from(domains).where(and(
        eq(domains.organizationId, access.organization.id), eq(domains.purpose, "status"),
      )).limit(1);
      return Response.json({ domain: row ?? null });
    },
    POST: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const body = await jsonBody(request);
      if (body instanceof Response) return body;
      if (typeof body.domain !== "string") return badInput("Enter a custom status subdomain", "domain");
      const candidate = body.domain.trim().toLowerCase().replace(/\.$/, "");
      if (candidate.length > 253 || candidate.split(".").length < 3 || !domainPattern.test(candidate) ||
        isReservedStatusCustomDomain(candidate)) {
        return badInput("Use a subdomain you own, such as status.example.com", "domain");
      }
      try {
        const result = await db.transaction(async (tx) => {
          await tx.select({ id: organizations.id }).from(organizations)
            .where(eq(organizations.id, access.organization.id)).for("update");
          const [page] = await tx.select().from(uptimeStatusPages)
            .where(eq(uptimeStatusPages.organizationId, access.organization.id)).for("update").limit(1);
          if (!page) return { error: "Create a status page first", status: 404 } as const;
          if (page.domainId) return { error: "This page already has its beta custom subdomain", status: 409 } as const;
          const [existing] = await tx.select({ id: domains.id }).from(domains)
            .where(eq(domains.domain, candidate)).limit(1);
          if (existing) return { error: "Domain is already claimed", status: 409 } as const;
          const [domain] = await tx.insert(domains).values({
            id: crypto.randomUUID(), domain: candidate,
            organizationId: access.organization.id, userId: access.session!.user.id,
            purpose: "status", status: "pending",
          }).returning();
          await tx.update(uptimeStatusPages).set({ domainId: domain.id, updatedAt: new Date() })
            .where(eq(uptimeStatusPages.id, page.id));
          return { domain } as const;
        });
        if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({
          domain: result.domain,
          dns: {
            txtName: `_outray-challenge.${candidate}`,
            txtValue: result.domain.id,
            cnameName: candidate,
            cnameTarget: statusDnsTarget(),
            proxy: "DNS only",
          },
        }, { status: 201 });
      } catch (error) {
        if ((error as { code?: string })?.code === "23505") return Response.json({ error: "Domain is already claimed" }, { status: 409 });
        throw error;
      }
    },
  } },
});
