import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { randomBytes } from "crypto";
import { requireOrgFromSlug } from "../../../lib/org";
import { redis } from "../../../lib/redis";

// Dashboard WebSocket tokens are short-lived (5 minutes)
const DASHBOARD_TOKEN_TTL_SECONDS = 300;

export const Route = createFileRoute("/api/$orgSlug/dashboard-token")({
  server: {
    handlers: {
      /**
       * Generate a short-lived token for dashboard WebSocket authentication.
       * This allows session-authenticated users to connect to the real-time
       * dashboard WebSocket on the tunnel server.
       */
      POST: async ({ request, params }) => {
        try {
          const { orgSlug } = params;

          // Validate session and org membership
          const orgContext = await requireOrgFromSlug(request, orgSlug);
          if ("error" in orgContext) {
            return orgContext.error;
          }

          // Generate a short-lived token
          const token = randomBytes(32).toString("hex");
          const tokenKey = `dashboard:ws:${token}`;

          // Store token with org info in Redis
          await redis.set(
            tokenKey,
            JSON.stringify({
              organizationId: orgContext.organization.id,
              userId: orgContext.session?.user.id,
              createdAt: Date.now(),
            }),
            "EX",
            DASHBOARD_TOKEN_TTL_SECONDS
          );

          return json({
            token,
            expiresIn: DASHBOARD_TOKEN_TTL_SECONDS,
          });
        } catch (error) {
          console.error("Dashboard token generation error:", error);
          return json(
            { error: "Failed to generate dashboard token" },
            { status: 500 }
          );
        }
      },
    },
  },
});
