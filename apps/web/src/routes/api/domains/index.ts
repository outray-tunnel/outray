import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "../../../lib/auth";
import { db } from "../../../db";
import { domains } from "../../../db/app-schema";

export const Route = createFileRoute("/api/domains/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        const organizationId = url.searchParams.get("organizationId");

        if (!organizationId) {
          return json({ error: "Organization ID required" }, { status: 400 });
        }

        const organizations = await auth.api.listOrganizations({
          headers: request.headers,
        });

        const hasAccess = organizations.find(
          (org) => org.id === organizationId,
        );

        if (!hasAccess) {
          return json({ error: "Unauthorized" }, { status: 403 });
        }

        const result = await db
          .select()
          .from(domains)
          .where(eq(domains.organizationId, organizationId))
          .orderBy(desc(domains.createdAt));

        return json({ domains: result });
      },
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { domain, organizationId } = body;

        if (!domain || !organizationId) {
          return json(
            { error: "Domain and Organization ID required" },
            { status: 400 },
          );
        }

        const organizations = await auth.api.listOrganizations({
          headers: request.headers,
        });

        const hasAccess = organizations.find(
          (org) => org.id === organizationId,
        );

        if (!hasAccess) {
          return json({ error: "Unauthorized" }, { status: 403 });
        }

        // Check if domain already exists
        const existingDomain = await db.query.domains.findFirst({
          where: eq(domains.domain, domain),
        });

        if (existingDomain) {
          return json({ error: "Domain already exists" }, { status: 400 });
        }

        const [newDomain] = await db
          .insert(domains)
          .values({
            id: nanoid(),
            domain,
            organizationId,
            userId: session.user.id,
            status: "pending",
          })
          .returning();

        return json({ domain: newDomain });
      },
    },
  },
});
