import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "../../../../db";
import { domains } from "../../../../db/app-schema";
import { subscriptions } from "../../../../db/subscription-schema";
import { organizations } from "../../../../db/auth-schema";
import { requireOrgFromSlug } from "../../../../lib/org";
import { isReservedStatusDomain } from "../../../../lib/reserved-status-domain";
import { capacityDescription, getPlanLimits } from "../../../../lib/subscription-plans";

export const Route = createFileRoute("/api/$orgSlug/domains/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization } = orgResult;

        const result = await db
          .select()
          .from(domains)
          .where(and(eq(domains.organizationId, organization.id), eq(domains.purpose, "tunnel")))
          .orderBy(desc(domains.createdAt));

        return Response.json({ domains: result });
      },
      POST: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization, session } = orgResult;

        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { domain } = body as { domain?: string };

        if (!domain) {
          return Response.json({ error: "Domain is required" }, { status: 400 });
        }

        const normalizedDomain = domain.trim().toLowerCase();

        if (isReservedStatusDomain(normalizedDomain)) {
          return Response.json(
            { error: "The status-page address and its subdomains are reserved for Uptime" },
            { status: 400 },
          );
        }

        const domainParts = normalizedDomain.split(".");
        if (domainParts.length < 3) {
          return Response.json(
            {
              error:
                "Only subdomains are allowed. Please enter a subdomain like api.myapp.com",
            },
            { status: 400 },
          );
        }

        const domainRegex =
          /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
        if (!domainRegex.test(normalizedDomain)) {
          return Response.json(
            { error: "Please enter a valid domain name" },
            { status: 400 },
          );
        }

        // Use a transaction with row-level locking to prevent race conditions
        try {
          const result = await db.transaction(async (tx) => {
            // Every organization exists, even without a hosted subscription.
            // Lock it so concurrent self-hosted/free creates cannot exceed capacity.
            await tx.select({ id: organizations.id }).from(organizations)
              .where(eq(organizations.id, organization.id)).for("update");
            const [subscription] = await tx
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.organizationId, organization.id))
              .for("update");

            const currentPlan = subscription?.plan || "free";
            const planLimits = getPlanLimits(currentPlan as any);
            const domainLimit = planLimits.maxDomains;

            // Count existing domains with lock to prevent race conditions
            const existingDomains = await tx
              .select({ id: domains.id })
              .from(domains)
              .where(and(eq(domains.organizationId, organization.id), eq(domains.purpose, "tunnel")))
              .for("update");

            const existingCount = existingDomains.length;

            if (existingCount >= domainLimit) {
              return {
                error: `Domain limit reached. ${capacityDescription(currentPlan, domainLimit, `custom domain${domainLimit !== 1 ? "s" : ""}`)}`,
                status: 403,
              };
            }

            // Check if domain is already taken (unique constraint also enforces this)
            const [existingDomain] = await tx
              .select()
              .from(domains)
              .where(eq(domains.domain, normalizedDomain))
              .limit(1)
              .for("update");

            if (existingDomain) {
              return { error: "Domain already exists", status: 409 };
            }

            const [newDomain] = await tx
              .insert(domains)
              .values({
                id: nanoid(),
                domain: normalizedDomain,
                organizationId: organization.id,
                userId: session.user.id,
                status: "pending",
                purpose: "tunnel",
              })
              .returning();

            return { domain: newDomain };
          });

          if ("error" in result) {
            return Response.json({ error: result.error }, { status: result.status });
          }

          return Response.json({ domain: result.domain });
        } catch (error: any) {
          // Handle unique constraint violation (race condition fallback)
          if (error?.code === "23505") {
            return Response.json({ error: "Domain already exists" }, { status: 409 });
          }
          throw error;
        }
      },
    },
  },
});
