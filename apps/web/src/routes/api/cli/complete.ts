import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import { cliLoginSessions, cliUserTokens } from "../../../db/auth-schema";
import { eq, and, gt } from "drizzle-orm";
import { auth } from "../../../lib/auth";
import { randomUUID, randomBytes } from "crypto";

export const Route = createFileRoute("/api/cli/complete")({
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
          const { code } = body;

          if (!code) {
            return Response.json(
              { error: "Missing required fields" },
              { status: 400 },
            );
          }

          // Verify session exists and is pending
          const loginSession = await db.query.cliLoginSessions.findFirst({
            where: and(
              eq(cliLoginSessions.code, code),
              eq(cliLoginSessions.status, "pending"),
              gt(cliLoginSessions.expiresAt, new Date()),
            ),
          });

          if (!loginSession) {
            return Response.json(
              { error: "Invalid or expired session" },
              { status: 400 },
            );
          }

          // Create user token (valid for 90 days)
          const userToken = randomBytes(32).toString("hex");
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 90);

          await db.insert(cliUserTokens).values({
            id: randomUUID(),
            token: userToken,
            userId: session.user.id,
            expiresAt: expiresAt,
          });

          // Update session
          await db
            .update(cliLoginSessions)
            .set({
              status: "authenticated",
              userId: session.user.id,
              userToken,
            })
            .where(eq(cliLoginSessions.id, loginSession.id));

          return Response.json({ success: true });
        } catch (error) {
          console.error("CLI complete error:", error);
          return Response.json(
            { error: "Failed to complete authentication" },
            { status: 500 },
          );
        }
      },
    },
  },
});
