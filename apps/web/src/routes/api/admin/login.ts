import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { randomUUID, timingSafeEqual, createHash } from "crypto";
import { redis } from "../../../lib/redis";
import { hashToken } from "../../../lib/hash";
import {
  rateLimit,
  getClientIdentifier,
  createRateLimitResponse,
} from "../../../lib/rate-limiter";

const PASSPHRASE = process.env.ADMIN_PASSPHRASE;
const TOKEN_TTL_SECONDS = 60 * 60; // 1h

/**
 * Timing-safe passphrase comparison to prevent timing attacks.
 * Uses SHA-256 hashing to ensure constant-length comparison regardless of input length.
 * Returns true if the phrases match, false otherwise.
 */
function safeComparePassphrase(input: string, expected: string): boolean {
  // Ensure both strings exist and have content
  if (!input || !expected) {
    return false;
  }

  // Hash both inputs to get fixed-length buffers
  // This prevents length-based timing attacks
  const inputHash = createHash("sha256").update(input).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(inputHash, expectedHash);
}

export const Route = createFileRoute("/api/admin/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Rate limit: 5 attempts per minute per IP (strict for admin login)
        const clientId = getClientIdentifier(request);
        const rateLimitResult = await rateLimit(clientId, {
          identifier: "admin-login",
          maxRequests: 5,
          windowSeconds: 60,
        });

        if (!rateLimitResult.allowed) {
          return createRateLimitResponse(rateLimitResult);
        }

        if (!PASSPHRASE) {
          return json(
            { error: "Admin passphrase not configured" },
            { status: 500 },
          );
        }

        let body: { phrase?: string } = {};
        try {
          body = await request.json();
        } catch (e) {
          return json({ error: "Invalid JSON" }, { status: 400 });
        }

        const phrase = (body.phrase || "").trim();
        if (!phrase) {
          return json({ error: "Phrase required" }, { status: 400 });
        }

        // Use timing-safe comparison to prevent timing attacks
        if (!safeComparePassphrase(phrase, PASSPHRASE)) {
          return json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = randomUUID();
        const tokenHash = hashToken(token);
        await redis.set(`admin:token:${tokenHash}`, "1", "EX", TOKEN_TTL_SECONDS);

        return json({ token, expiresIn: TOKEN_TTL_SECONDS });
      },
    },
  },
});
