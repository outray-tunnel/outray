import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { resolveCname, resolveTxt } from "dns/promises";
import { db } from "../../../../db";
import { domains } from "../../../../db/app-schema";
import { requireOrgFromSlug } from "../../../../lib/org";

export const Route = createFileRoute("/api/$orgSlug/domains/$domainId/verify")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { orgSlug, domainId } = params;

        const orgContext = await requireOrgFromSlug(request, orgSlug);
        if ("error" in orgContext) {
          return orgContext.error;
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

        try {
          const txtRecords = await resolveTxt(
            `_outray-challenge.${domain.domain}`,
          );
          const hasValidTxt = txtRecords.some((record) =>
            record.includes(domain.id),
          );

          if (!hasValidTxt) {
            return Response.json(
              {
                error: `TXT record verification failed. Expected "${domain.id}" at "_outray-challenge.${domain.domain}"`,
              },
              { status: 400 },
            );
          }

          try {
            const cnameRecords = await resolveCname(domain.domain);
            cnameRecords.some((record) => record === "edge.outray.app");
          } catch (e) {
            // CNAME lookup may fail for flattened records; ignore.
          }

          await db
            .update(domains)
            .set({ status: "active", updatedAt: new Date() })
            .where(eq(domains.id, domainId));

          return Response.json({ verified: true });
        } catch (error) {
          console.error("Verification error:", error);
          return Response.json(
            { error: "Verification failed. Please check your DNS records." },
            { status: 400 },
          );
        }
      },
    },
  },
});
