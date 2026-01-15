import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../../../db";
import { authTokens } from "../../../db/app-schema";
import { requireOrgFromSlug } from "../../../lib/org";

export const Route = createFileRoute("/api/$orgSlug/auth-tokens")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization } = orgResult;

        const tokens = await db
          .select()
          .from(authTokens)
          .where(eq(authTokens.organizationId, organization.id));

        return Response.json({ tokens });
      },
      POST: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization, session } = orgResult;

        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { name } = body as { name?: string };

        if (!name) {
          return Response.json({ error: "Name is required" }, { status: 400 });
        }

        const token = `outray_${randomBytes(32).toString("hex")}`;

        const [newToken] = await db
          .insert(authTokens)
          .values({
            id: crypto.randomUUID(),
            name,
            token,
            organizationId: organization.id,
            userId: session.user.id,
          })
          .returning();

        return Response.json({ token: newToken.token });
      },
      DELETE: async ({ request, params }) => {
        const orgResult = await requireOrgFromSlug(request, params.orgSlug);
        if ("error" in orgResult) return orgResult.error;
        const { organization } = orgResult;

        const body = await request.json();
        const { id } = body as { id?: string };

        if (!id) {
          return Response.json(
            { error: "Token ID is required" },
            { status: 400 },
          );
        }

        await db
          .delete(authTokens)
          .where(
            and(
              eq(authTokens.id, id),
              eq(authTokens.organizationId, organization.id),
            ),
          );

        return Response.json({ success: true });
      },
    },
  },
});
