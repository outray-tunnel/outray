import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../../db";
import { cliLoginSessions } from "../../../../db/auth-schema";
import { eq, and, gt } from "drizzle-orm";
import {
  rateLimiters,
  getClientIdentifier,
  createRateLimitResponse,
} from "../../../../lib/rate-limiter";

export const Route = createFileRoute("/api/cli/login/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          // Rate limit: 60 requests per minute per IP (allows 5s polling)
          const clientId = getClientIdentifier(request);
          const rateLimitResult = await rateLimiters.cliLoginStatus(clientId);

          if (!rateLimitResult.allowed) {
            return createRateLimitResponse(rateLimitResult);
          }

          const url = new URL(request.url);
          const code = url.searchParams.get("code");

          if (!code) {
            return Response.json({ status: "expired" }, { status: 400 });
          }

          const session = await db.query.cliLoginSessions.findFirst({
            where: and(
              eq(cliLoginSessions.code, code),
              gt(cliLoginSessions.expiresAt, new Date()),
            ),
          });

          if (!session) {
            return Response.json({ status: "expired" });
          }

          if (session.status === "authenticated" && session.userToken) {
            return Response.json({
              status: "authenticated",
              userToken: session.userToken,
            });
          }

          return Response.json({ status: "pending" });
        } catch (error) {
          console.error("CLI login status error:", error);
          return Response.json(
            { error: "Failed to check status" },
            { status: 500 },
          );
        }
      },
    },
  },
});
