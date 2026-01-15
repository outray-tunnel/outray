import { createFileRoute } from "@tanstack/react-router";
import { auth } from "../../../lib/auth";
import { redis } from "../../../lib/redis";
import { randomBytes } from "crypto";

const TOKEN_PREFIX = "dashboard:ws:";
const TOKEN_TTL_SECONDS = 30;

function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}

export const Route = createFileRoute("/api/dashboard/ws-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({
            headers: request.headers,
          });
          if (!session) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const body = await request.json();
          const { orgId } = body;

          if (!orgId) {
            return Response.json(
              { error: "Organization ID required" },
              { status: 400 },
            );
          }

          // Verify user has access to this organization
          const organizations = await auth.api.listOrganizations({
            headers: request.headers,
          });

          const hasAccess = organizations.some((org) => org.id === orgId);
          if (!hasAccess) {
            return Response.json(
              { error: "Access denied to organization" },
              { status: 403 },
            );
          }

          const token = generateSecureToken();
          const tokenData = JSON.stringify({
            orgId,
            userId: session.user.id,
          });

          await redis.set(
            `${TOKEN_PREFIX}${token}`,
            tokenData,
            "EX",
            TOKEN_TTL_SECONDS,
          );

          return Response.json({ token, expiresIn: TOKEN_TTL_SECONDS });
        } catch (error) {
          console.error("Error generating dashboard token:", error);
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
