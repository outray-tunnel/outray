import { createFileRoute } from "@tanstack/react-router";
import { eq, sql } from "drizzle-orm";

import { db } from "../../../../db";
import { subdomains } from "../../../../db/app-schema";
import { subscriptions } from "../../../../db/subscription-schema";
import { requireOrgFromSlug } from "../../../../lib/org";
import { getPlanLimits } from "../../../../lib/subscription-plans";

export const Route = createFileRoute("/api/$orgSlug/subdomains/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization } = orgResult;

        const results = await db
          .select()
          .from(subdomains)
          .where(eq(subdomains.organizationId, organization.id));

        return Response.json({ subdomains: results });
      },
      POST: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization, session } = orgResult;

        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { subdomain } = body as { subdomain?: string };

        if (!subdomain) {
          return Response.json(
            { error: "Subdomain is required" },
            { status: 400 },
          );
        }

        const subdomainRegex = /^[a-z0-9-]+$/;
        if (!subdomainRegex.test(subdomain)) {
          return Response.json(
            {
              error:
                "Invalid subdomain format. Use lowercase letters, numbers, and hyphens.",
            },
            { status: 400 },
          );
        }

        // Use a transaction with row-level locking to prevent race conditions
        // This ensures atomic check-and-insert to enforce subdomain limits
        try {
          const result = await db.transaction(async (tx) => {
            // Lock the organization's subscription row to serialize concurrent requests
            const [subscription] = await tx
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.organizationId, organization.id))
              .for("update");

            const currentPlan = subscription?.plan || "free";
            const planLimits = getPlanLimits(currentPlan as any);
            const subdomainLimit = planLimits.maxSubdomains;

            // Count existing subdomains - lock the rows to prevent race conditions
            const existingSubdomains = await tx
              .select({ id: subdomains.id })
              .from(subdomains)
              .where(eq(subdomains.organizationId, organization.id))
              .for("update");

            const existingCount = existingSubdomains.length;

            if (subdomainLimit !== -1 && existingCount >= subdomainLimit) {
              return {
                error: `Subdomain limit reached. The ${currentPlan} plan allows ${subdomainLimit} subdomain${subdomainLimit > 1 ? "s" : ""}.`,
                status: 403,
              };
            }

            // Check if subdomain is already taken (unique constraint also enforces this)
            const existing = await tx
              .select()
              .from(subdomains)
              .where(eq(subdomains.subdomain, subdomain))
              .limit(1)
              .for("update");

            if (existing.length > 0) {
              return { error: "Subdomain already taken", status: 409 };
            }

            const [newSubdomain] = await tx
              .insert(subdomains)
              .values({
                id: crypto.randomUUID(),
                subdomain,
                organizationId: organization.id,
                userId: session.user.id,
              })
              .returning();

            return { subdomain: newSubdomain };
          });

          if ("error" in result) {
            return Response.json(
              { error: result.error },
              { status: result.status },
            );
          }

          return Response.json({ subdomain: result.subdomain });
        } catch (error: any) {
          // Handle unique constraint violation (race condition fallback)
          if (error?.code === "23505") {
            return Response.json(
              { error: "Subdomain already taken" },
              { status: 409 },
            );
          }
          throw error;
        }
      },
    },
  },
});
