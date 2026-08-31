import { createFileRoute } from "@tanstack/react-router";
import { db } from "../../../db";
import { cliLoginSessions } from "../../../db/auth-schema";
import { randomUUID, randomBytes } from "crypto";
import {rateLimiters, getClientIdentifier, createRateLimitResponse,} from "../../../lib/rate-limiter";
import { privateJson, privateNoStore } from "../../../lib/private-json";

export const Route = createFileRoute("/api/cli/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Rate limit: 10 requests per minute per IP
          const clientId = getClientIdentifier(request);
          const rateLimitResult = await rateLimiters.cliLogin(clientId);

          if (!rateLimitResult.allowed) {
            return privateNoStore(createRateLimitResponse(rateLimitResult));
          }

          const code = randomBytes(32).toString("hex");
          const id = randomUUID();

          const expiresAt = new Date();
          expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 minute expiry

          await db.insert(cliLoginSessions).values({
            id,
            code,
            status: "pending",
            expiresAt,
          });

          const baseUrl = process.env.APP_URL ?? new URL(request.url).origin;

          return privateJson({
            loginUrl: `${baseUrl}/cli/login?code=${code}`,
            code,
            expiresIn: 300,
          });
        } catch (error) {
          console.error("CLI login error:", error);
          return privateJson(
            { error: "Failed to create login session" },
            { status: 500 },
          );
        }
      },
    },
  },
});
