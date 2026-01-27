import { createFileRoute } from "@tanstack/react-router";
import { auth } from "../../../../lib/auth";
import { db } from "../../../../db";
import { subscriptions } from "../../../../db/subscription-schema";
import { organizations, members } from "../../../../db/auth-schema";
import { eq, and } from "drizzle-orm";

export const Route = createFileRoute("/api/subscriptions/$orgSlug/cancel")({
  server: {
    handlers: {
      /**
       * POST /api/subscriptions/:orgSlug/cancel
       *
       * Cancels a Paystack subscription at period end.
       * The subscription remains active until currentPeriodEnd.
       */
      POST: async ({ request, params }) => {
        const { orgSlug } = params;

        // Get user session
        const session = await auth.api.getSession({
          headers: request.headers,
        });

        if (!session?.user) {
          return Response.json(
            { error: "Authentication required." },
            { status: 401 },
          );
        }

        try {
          // Get organization by slug
          const org = await db.query.organizations.findFirst({
            where: eq(organizations.slug, orgSlug),
          });

          if (!org) {
            return Response.json(
              { error: "Organization not found." },
              { status: 404 },
            );
          }

          // Check if user is a member with billing permission (owner or admin)
          const membership = await db.query.members.findFirst({
            where: and(
              eq(members.organizationId, org.id),
              eq(members.userId, session.user.id),
            ),
          });

          if (!membership || !["owner", "admin"].includes(membership.role)) {
            return Response.json(
              { error: "You don't have permission to manage billing." },
              { status: 403 },
            );
          }

          // Get the subscription
          const subscription = await db.query.subscriptions.findFirst({
            where: eq(subscriptions.organizationId, org.id),
          });

          if (!subscription) {
            return Response.json(
              { error: "No active subscription found." },
              { status: 404 },
            );
          }

          if (subscription.paymentProvider !== "paystack") {
            return Response.json(
              { error: "This endpoint is for Paystack subscriptions only." },
              { status: 400 },
            );
          }

          // Set cancelAtPeriodEnd to true
          await db
            .update(subscriptions)
            .set({
              cancelAtPeriodEnd: true,
              canceledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.organizationId, org.id));

          console.log(
            `[Subscription] Cancelled Paystack subscription for org ${org.id} at period end`,
          );

          return Response.json({
            success: true,
            message: "Subscription will be cancelled at the end of the billing period.",
            cancelAt: subscription.currentPeriodEnd,
          });
        } catch (error) {
          console.error("[Subscription Cancel] Error:", error);
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to cancel subscription",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
