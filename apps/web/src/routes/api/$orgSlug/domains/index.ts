import { createFileRoute } from "@tanstack/react-router";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "../../../../db";
import { domains } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";

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
          .where(eq(domains.organizationId, organization.id))
          .orderBy(desc(domains.createdAt));

        return Response.json({ domains: result });
      },
      POST: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization, session } = orgResult;

        const body = await request.json();
        const { domain } = body as { domain?: string };

        if (!domain) {
          return Response.json(
            { error: "Domain is required" },
            { status: 400 },
          );
        }

        const domainParts = domain.trim().split(".");
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
        if (!domainRegex.test(domain.trim())) {
          return Response.json(
            { error: "Please enter a valid domain name" },
            { status: 400 },
          );
        }

        const existingDomain = await db.query.domains.findFirst({
          where: eq(domains.domain, domain.trim()),
        });

        if (existingDomain) {
          return Response.json(
            { error: "Domain already exists" },
            { status: 400 },
          );
        }

        const [newDomain] = await db
          .insert(domains)
          .values({
            id: nanoid(),
            domain,
            organizationId: organization.id,
            userId: session?.user.id!,
            status: "pending",
          })
          .returning();

        return Response.json({ domain: newDomain });
      },
    },
  },
});
