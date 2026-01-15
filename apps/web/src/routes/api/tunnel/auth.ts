import { createFileRoute } from "@tanstack/react-router";
import { eq, and, gt } from "drizzle-orm";
import { db } from "../../../db";
import { authTokens, organizationSettings } from "../../../db/app-schema";
import { cliOrgTokens } from "../../../db/auth-schema";
import { subscriptions } from "../../../db/subscription-schema";
import { SUBSCRIPTION_PLANS } from "../../../lib/subscription-plans";
import {
  rateLimiters,
  getClientIdentifier,
  createRateLimitResponse,
} from "../../../lib/rate-limiter";

export const Route = createFileRoute("/api/tunnel/auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Rate limit: 30 requests per minute per IP
          const clientId = getClientIdentifier(request);
          const rateLimitResult = await rateLimiters.tunnelAuth(clientId);

          if (!rateLimitResult.allowed) {
            return createRateLimitResponse(rateLimitResult);
          }

          const body = await request.json();
          const { token } = body;

          if (!token) {
            return Response.json(
              { valid: false, error: "Missing Auth Token" },
              { status: 400 },
            );
          }

          let organizationId: string | undefined;
          let userId: string | undefined;
          let organization: any;
          let tokenType: "legacy" | "org" | undefined;

          // Try CLI org token first
          const cliOrgToken = await db.query.cliOrgTokens.findFirst({
            where: and(
              eq(cliOrgTokens.token, token),
              gt(cliOrgTokens.expiresAt, new Date()),
            ),
            with: {
              organization: true,
            },
          });

          if (cliOrgToken) {
            // Update last used
            await db
              .update(cliOrgTokens)
              .set({ lastUsedAt: new Date() })
              .where(eq(cliOrgTokens.id, cliOrgToken.id));

            organizationId = cliOrgToken.organizationId;
            userId = cliOrgToken.userId;
            organization = cliOrgToken.organization;
            tokenType = "org";
          } else {
            // Fall back to legacy auth tokens
            const tokenRecord = await db.query.authTokens.findFirst({
              where: eq(authTokens.token, token),
              with: {
                organization: true,
              },
            });

            if (tokenRecord) {
              await db
                .update(authTokens)
                .set({ lastUsedAt: new Date() })
                .where(eq(authTokens.id, tokenRecord.id));

              organizationId = tokenRecord.organizationId;
              userId = tokenRecord.userId;
              organization = tokenRecord.organization;
              tokenType = "legacy";
            }
          }

          if (!organizationId || !organization) {
            return Response.json(
              { valid: false, error: "Invalid Auth Token" },
              { status: 401 },
            );
          }

          // Fetch subscription to get bandwidth limit
          const subscription = await db.query.subscriptions.findFirst({
            where: eq(subscriptions.organizationId, organizationId),
          });

          // Fetch organization settings for full capture
          const orgSettings = await db.query.organizationSettings.findFirst({
            where: eq(organizationSettings.organizationId, organizationId),
          });

          const plan = (subscription?.plan ||
            "free") as keyof typeof SUBSCRIPTION_PLANS;
          const bandwidthLimit =
            SUBSCRIPTION_PLANS[plan].features.bandwidthPerMonth;
          const retentionDays = SUBSCRIPTION_PLANS[plan].features.retentionDays;
          const fullCaptureEnabled = orgSettings?.fullCaptureEnabled ?? false;

          return Response.json({
            valid: true,
            userId,
            organizationId,
            organization: {
              id: organization.id,
              name: organization.name,
              slug: organization.slug,
            },
            tokenType,
            bandwidthLimit,
            retentionDays,
            plan,
            fullCaptureEnabled,
          });
        } catch (error) {
          console.error("Error in /api/tunnel/auth:", error);
          return Response.json(
            {
              valid: false,
              error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
