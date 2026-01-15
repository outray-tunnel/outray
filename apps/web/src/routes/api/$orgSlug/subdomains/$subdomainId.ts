import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { subdomains } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";

export const Route = createFileRoute("/api/$orgSlug/subdomains/$subdomainId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const { orgSlug, subdomainId } = params;

        const orgContext = await requireOrgFromSlug(request, orgSlug);
        if ("error" in orgContext) {
          return orgContext.error;
        }

        const [subdomain] = await db
          .select()
          .from(subdomains)
          .where(eq(subdomains.id, subdomainId));

        if (!subdomain) {
          return Response.json(
            { error: "Subdomain not found" },
            { status: 404 },
          );
        }

        if (subdomain.organizationId !== orgContext.organization.id) {
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        }

        await db.delete(subdomains).where(eq(subdomains.id, subdomainId));

        return Response.json({ success: true });
      },
    },
  },
});
