import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { domains } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";

export const Route = createFileRoute("/api/$orgSlug/domains/$domainId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const { orgSlug, domainId } = params;

        const orgContext = await requireOrgFromSlug(request, orgSlug);
        if ("error" in orgContext) {
          return orgContext.error;
        }

        if (!domainId) {
          return Response.json(
            { error: "Domain ID required" },
            { status: 400 },
          );
        }

        const domain = await db.query.domains.findFirst({
          where: eq(domains.id, domainId),
        });

        if (!domain) {
          return Response.json({ error: "Domain not found" }, { status: 404 });
        }

        if (domain.organizationId !== orgContext.organization.id) {
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        }

        await db.delete(domains).where(eq(domains.id, domainId)).returning();

        return Response.json({ message: "Domain deleted successfully" });
      },
    },
  },
});
