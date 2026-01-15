import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../../db";
import { tunnels } from "../../../db/app-schema";
import { subscriptions } from "../../../db/subscription-schema";
import { getPlanLimits } from "../../../lib/subscription-plans";
import { redis } from "../../../lib/redis";
import {
  rateLimiters,
  getClientIdentifier,
  createRateLimitResponse,
} from "../../../lib/rate-limiter";

export const Route = createFileRoute("/api/tunnel/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Rate limit: 20 requests per minute per IP
          const clientId = getClientIdentifier(request);
          const rateLimitResult = await rateLimiters.tunnelRegister(clientId);

          if (!rateLimitResult.allowed) {
            return createRateLimitResponse(rateLimitResult);
          }

          const body = (await request.json()) as {
            userId?: string;
            organizationId?: string;
            url?: string;
            protocol?: "http" | "tcp" | "udp";
            remotePort?: number;
            tunnelId?: string;
            name?: string;
          };

          const {
            userId,
            organizationId,
            url,
            protocol = "http",
            remotePort,
            tunnelId: providedTunnelId,
            name,
          } = body;

          if (!userId || !organizationId) {
            return Response.json(
              { error: "Missing required fields" },
              { status: 400 },
            );
          }

          // For all protocols, we need url
          if (!url) {
            return Response.json(
              { error: "Missing URL for tunnel" },
              { status: 400 },
            );
          }

          // For TCP/UDP, we also need tunnelId and remotePort
          if (
            (protocol === "tcp" || protocol === "udp") &&
            (!providedTunnelId || !remotePort)
          ) {
            return Response.json(
              { error: "Missing tunnelId or remotePort for TCP/UDP tunnel" },
              { status: 400 },
            );
          }

          // Get the tunnel ID from the URL (hostname) for HTTP, or use provided for TCP/UDP
          let tunnelId: string;
          if (protocol === "http") {
            const urlObj = new URL(
              url!.startsWith("http") ? url! : `https://${url}`,
            );
            tunnelId = urlObj.hostname;
          } else {
            tunnelId = providedTunnelId!;
          }

          // Use the URL passed from the tunnel server
          const tunnelUrl = url;

          // Use a transaction with row-level locking to prevent race conditions
          const result = await db.transaction(async (tx) => {
            // Lock the organization's subscription row to serialize concurrent requests
            const [subscription] = await tx
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.organizationId, organizationId))
              .for("update");

            const currentPlan = subscription?.plan || "free";
            const planLimits = getPlanLimits(currentPlan as any);
            const tunnelLimit = planLimits.maxTunnels;

            const setKey = `org:${organizationId}:online_tunnels`;

            // Check if tunnel already exists in database (with lock)
            const [existingTunnel] = await tx
              .select()
              .from(tunnels)
              .where(eq(tunnels.url, tunnelUrl))
              .for("update");

            const isReconnection = !!existingTunnel;

            console.log(
              `[TUNNEL LIMIT CHECK] Org: ${organizationId}, Tunnel: ${tunnelId}`,
            );
            console.log(
              `[TUNNEL LIMIT CHECK] Is Reconnection: ${isReconnection}`,
            );
            console.log(
              `[TUNNEL LIMIT CHECK] Plan: ${currentPlan}, Limit: ${tunnelLimit}`,
            );

            // Check limits only for NEW tunnels (not reconnections)
            if (!isReconnection) {
              // Count active tunnels from Redis SET
              const activeCount = await redis.scard(setKey);
              console.log(
                `[TUNNEL LIMIT CHECK] Active count in Redis: ${activeCount}`,
              );

              // The current tunnel is NOT yet in the online_tunnels set (added after successful registration)
              // So we check if activeCount >= limit (not >)
              if (activeCount >= tunnelLimit) {
                console.log(
                  `[TUNNEL LIMIT CHECK] REJECTED - ${activeCount} >= ${tunnelLimit}`,
                );
                return {
                  error: `Tunnel limit reached. The ${currentPlan} plan allows ${tunnelLimit} active tunnel${tunnelLimit > 1 ? "s" : ""}.`,
                  status: 403,
                };
              }
              console.log(
                `[TUNNEL LIMIT CHECK] ALLOWED - ${activeCount} < ${tunnelLimit}`,
              );
            } else {
              console.log(
                `[TUNNEL LIMIT CHECK] SKIPPED - Reconnection detected`,
              );
            }

            if (existingTunnel) {
              // Tunnel with this URL already exists, update lastSeenAt
              await tx
                .update(tunnels)
                .set({ lastSeenAt: new Date() })
                .where(eq(tunnels.id, existingTunnel.id));

              return { success: true, tunnelId: existingTunnel.id };
            }

            // Create new tunnel record
            const tunnelRecord = {
              id: randomUUID(),
              url: tunnelUrl,
              userId,
              organizationId,
              name: name || null,
              protocol,
              remotePort: remotePort || null,
              lastSeenAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            await tx.insert(tunnels).values(tunnelRecord);

            return { success: true, tunnelId: tunnelRecord.id };
          });

          if ("error" in result) {
            return Response.json(
              { error: result.error },
              { status: result.status },
            );
          }

          return Response.json({ success: true, tunnelId: result.tunnelId });
        } catch (error) {
          console.error("Tunnel registration error:", error);
          return Response.json(
            { error: "Internal server error" },
            { status: 500 },
          );
        }
      },
    },
  },
});
