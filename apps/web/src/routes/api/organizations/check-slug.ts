import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { auth } from "../../../lib/auth";
import { db } from "../../../db";
import { organizations } from "../../../db/auth-schema";
import { instanceConfig } from "../../../../../../shared/instance-config";
import { workspaceSlugErrorMessage, workspaceSlugRejection } from "../../../../../../shared/workspace-slugs";

export const Route = createFileRoute("/api/organizations/check-slug")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Provide a valid workspace URL." }, { status: 400 });
        }
        const slug = body && typeof body === "object" && "slug" in body ? body.slug : undefined;
        const reason = workspaceSlugRejection(slug, instanceConfig());

        if (reason === "invalid") {
          return Response.json({ error: workspaceSlugErrorMessage(reason) }, { status: 400 });
        }

        if (reason) {
          return Response.json({ available: false, reason });
        }

        const existingOrg = await db.query.organizations.findFirst({
          where: eq(organizations.slug, slug as string),
        });

        return Response.json({ available: !existingOrg, ...(existingOrg ? { reason: "taken" } : {}) });
      },
    },
  },
});
