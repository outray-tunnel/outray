import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "crypto";
import { redis } from "../../../lib/redis";
import { hashToken } from "../../../lib/hash";

const PASSPHRASE = process.env.ADMIN_PASSPHRASE;
const TOKEN_TTL_SECONDS = 60 * 60; // 1h

export const Route = createFileRoute("/api/admin/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!PASSPHRASE) {
          return Response.json(
            { error: "Admin passphrase not configured" },
            { status: 500 },
          );
        }

        let body: { phrase?: string } = {};
        try {
          body = await request.json();
        } catch (e) {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const phrase = (body.phrase || "").trim();
        if (!phrase) {
          return Response.json({ error: "Phrase required" }, { status: 400 });
        }

        if (phrase !== PASSPHRASE) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = randomUUID();
        const tokenHash = hashToken(token);
        await redis.set(
          `admin:token:${tokenHash}`,
          "1",
          "EX",
          TOKEN_TTL_SECONDS,
        );

        return Response.json({ token, expiresIn: TOKEN_TTL_SECONDS });
      },
    },
  },
});
