import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import { members, cliUserTokens, organizations } from "../../../db/auth-schema";
import { eq } from "drizzle-orm";

export const Route = createFileRoute("/api/me/orgs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const authHeader = request.headers.get("Authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const token = authHeader.substring(7);

          // Check if it's a CLI user token
          const userToken = await db.query.cliUserTokens.findFirst({
            where: (cliUserTokens, { eq, gt, and }) =>
              and(
                eq(cliUserTokens.token, token),
                gt(cliUserTokens.expiresAt, new Date()),
              ),
          });

          if (!userToken) {
            return Response.json({ error: "Invalid token" }, { status: 401 });
          }

          // Update last used
          try {
            await db
              .update(cliUserTokens)
              .set({ lastUsedAt: new Date() })
              .where(eq(cliUserTokens.token, token));
          } catch (e) {
            console.error("Failed to update lastUsedAt:", e);
          }

          // Get user's organizations using explicit join
          const userOrgs = await db
            .select({
              organization: organizations,
              role: members.role,
            })
            .from(members)
            .innerJoin(
              organizations,
              eq(members.organizationId, organizations.id),
            )
            .where(eq(members.userId, userToken.userId));

          const orgs = userOrgs.map((row) => ({
            id: row.organization.id,
            slug: row.organization.slug,
            name: row.organization.name,
            role: row.role,
          }));

          return Response.json(orgs);
        } catch (error) {
          console.error("Get orgs error:", error);
          return Response.json(
            { error: "Failed to fetch organizations" },
            { status: 500 },
          );
        }
      },
    },
  },
});
