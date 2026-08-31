import { createFileRoute } from "@tanstack/react-router";
import { eq, and, gt } from "drizzle-orm";
import { db } from "../../../db";
import { authTokens, organizationSettings } from "../../../db/app-schema";
import {
  cliOrgTokens,
  members,
  organizations,
} from "../../../db/auth-schema";
import { machineTokens } from "../../../db/secrets-schema";
import { subscriptions } from "../../../db/subscription-schema";
import {
  hashMachineToken,
  machineTokenPrefix,
} from "../../../lib/machine-tokens";
import { SUBSCRIPTION_PLANS } from "../../../lib/subscription-plans";
import {rateLimiters, getClientIdentifier, createRateLimitResponse,} from "../../../lib/rate-limiter";

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

          const body: unknown = await request.json();
          const token =
            body &&
            typeof body === "object" &&
            "token" in body &&
            typeof (body as { token?: unknown }).token === "string"
              ? (body as { token: string }).token
              : null;

          if (!token || token.length > 512) {
            return Response.json(
              { valid: false, error: "Invalid Auth Token" },
              { status: 400 },
            );
          }

          let organizationId: string | undefined;
          let userId: string | undefined;
          let organization: any;
          let tokenType: "legacy" | "machine" | "org" | undefined;

          // Durable machine credentials are stored only as SHA-256 hashes.
          // A matching but revoked/expired token must fail closed instead of
          // falling through to the temporary plaintext compatibility table.
          const machineToken = await db.query.machineTokens.findFirst({
            where: eq(machineTokens.tokenHash, hashMachineToken(token)),
            with: { organization: true },
          });

          if (machineToken) {
            const expired =
              machineToken.expiresAt !== null &&
              machineToken.expiresAt <= new Date();
            const canConnect = machineToken.scopes.includes("tunnel:connect");

            if (machineToken.revokedAt || expired || !canConnect) {
              return Response.json(
                { valid: false, error: "Invalid Auth Token" },
                { status: 401 },
              );
            }

            await db
              .update(machineTokens)
              .set({ lastUsedAt: new Date() })
              .where(eq(machineTokens.id, machineToken.id));

            organizationId = machineToken.organizationId;
            userId = machineToken.createdById ?? undefined;
            organization = machineToken.organization;
            tokenType = "machine";
          }

          // Try CLI org token first
          const [cliOrgCredential] = organizationId
            ? []
            : await db
                .select({
                  token: cliOrgTokens,
                  organization: organizations,
                })
                .from(cliOrgTokens)
                .innerJoin(
                  organizations,
                  eq(cliOrgTokens.organizationId, organizations.id),
                )
                .innerJoin(
                  members,
                  and(
                    eq(members.organizationId, cliOrgTokens.organizationId),
                    eq(members.userId, cliOrgTokens.userId),
                  ),
                )
                .where(
                  and(
                    eq(cliOrgTokens.token, token),
                    gt(cliOrgTokens.expiresAt, new Date()),
                  ),
                )
                .limit(1);

          if (cliOrgCredential) {
            // Update last used
            await db
              .update(cliOrgTokens)
              .set({ lastUsedAt: new Date() })
              .where(eq(cliOrgTokens.id, cliOrgCredential.token.id));

            organizationId = cliOrgCredential.token.organizationId;
            userId = cliOrgCredential.token.userId;
            organization = cliOrgCredential.organization;
            tokenType = "org";
          } else if (!organizationId) {
            // Fall back to legacy auth tokens
            const tokenRecord = await db.query.authTokens.findFirst({
              where: eq(authTokens.token, token),
              with: {
                organization: true,
              },
            });

            if (tokenRecord) {
              console.warn("legacy_auth_token_fallback", {
                tokenId: tokenRecord.id,
                organizationId: tokenRecord.organizationId,
              });
              const usedAt = new Date();
              await db.transaction(async (tx) => {
                await tx
                  .update(authTokens)
                  .set({ lastUsedAt: usedAt })
                  .where(eq(authTokens.id, tokenRecord.id));
                await tx
                  .insert(machineTokens)
                  .values({
                    id: crypto.randomUUID(),
                    organizationId: tokenRecord.organizationId,
                    name: tokenRecord.name,
                    tokenHash: hashMachineToken(token),
                    prefix: machineTokenPrefix(token),
                    scopes: ["tunnel:connect"],
                    createdById: tokenRecord.userId,
                    createdAt: tokenRecord.createdAt,
                    lastUsedAt: usedAt,
                  })
                  .onConflictDoNothing({ target: machineTokens.tokenHash });
              });

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
              error: "Authentication could not be completed",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
