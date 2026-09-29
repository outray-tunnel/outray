import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { domains } from "../../../db/app-schema";
import { isReservedStatusDomain } from "../../../lib/reserved-status-domain";

export const Route = createFileRoute("/api/domain/verify-ownership")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            domain?: string;
            organizationId?: string;
          };

          const { domain, organizationId } = body;

          if (typeof domain !== "string" || !domain) {
            return Response.json(
              { valid: false, error: "Missing required fields" },
              { status: 400 },
            );
          }

          if (!organizationId) {
            return Response.json(
              { valid: false, error: "Missing required fields" },
              { status: 400 },
            );
          }

          if (isReservedStatusDomain(domain)) {
            return Response.json({ valid: false, error: "Hostname reserved for Uptime status pages" });
          }

          const [existingDomain] = await db
            .select()
            .from(domains)
            .where(
              and(
                eq(domains.domain, domain),
                eq(domains.organizationId, organizationId),
                eq(domains.purpose, "tunnel"),
              ),
            );

          if (!existingDomain) {
            return Response.json({
              valid: false,
              error: "Domain not found or does not belong to your organization",
            });
          }

          if (existingDomain.status !== "active") {
            return Response.json({
              valid: false,
              error: "Domain is not verified. Please verify DNS records first.",
            });
          }

          return Response.json({ valid: true });
        } catch (error) {
          console.error("Domain verification error:", error);
          return Response.json(
            { valid: false, error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
