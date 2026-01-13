import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { timingSafeEqual, createHash } from "crypto";
import { db } from "../../../db";
import { domains } from "../../../db/app-schema";
import {
  rateLimit,
  getClientIdentifier,
  createRateLimitResponse,
} from "../../../lib/rate-limiter";

// Internal API secret for server-to-server authentication
// This endpoint should only be called by the tunnel server
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

/**
 * Timing-safe secret comparison using hashing for constant-length buffers.
 */
function safeCompareSecret(input: string | null, expected: string): boolean {
  if (!input) return false;

  const inputHash = createHash("sha256").update(input).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(inputHash, expectedHash);
}

export const Route = createFileRoute("/api/domain/verify-ownership")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Rate limit to prevent enumeration attacks
          const clientId = getClientIdentifier(request);
          const rateLimitResult = await rateLimit(clientId, {
            identifier: "domain-verify",
            maxRequests: 30,
            windowSeconds: 60,
          });

          if (!rateLimitResult.allowed) {
            return createRateLimitResponse(rateLimitResult);
          }

          // Verify internal API secret for server-to-server calls
          // This prevents external enumeration of domain ownership
          const authHeader = request.headers.get("x-internal-secret");
          if (INTERNAL_API_SECRET && !safeCompareSecret(authHeader, INTERNAL_API_SECRET)) {
            return json(
              { valid: false, error: "Unauthorized" },
              { status: 401 }
            );
          }

          const body = (await request.json()) as {
            domain?: string;
            organizationId?: string;
          };

          const { domain, organizationId } = body;

          if (!domain) {
            return json(
              { valid: false, error: "Missing required fields" },
              { status: 400 },
            );
          }

          if (!organizationId) {
            return json(
              { valid: false, error: "Missing required fields" },
              { status: 400 },
            );
          }

          const [existingDomain] = await db
            .select()
            .from(domains)
            .where(
              and(
                eq(domains.domain, domain),
                eq(domains.organizationId, organizationId),
              ),
            );

          if (!existingDomain) {
            return json({
              valid: false,
              error: "Domain not found or does not belong to your organization",
            });
          }

          if (existingDomain.status !== "active") {
            return json({
              valid: false,
              error: "Domain is not verified. Please verify DNS records first.",
            });
          }

          return json({ valid: true });
        } catch (error) {
          console.error("Domain verification error:", error);
          return json(
            { valid: false, error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
