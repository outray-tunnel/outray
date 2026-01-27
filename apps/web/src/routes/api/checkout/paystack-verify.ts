import { createFileRoute } from "@tanstack/react-router";
import { eq, and } from "drizzle-orm";
import { auth } from "../../../lib/auth";
import { verifyTransaction } from "../../../lib/paystack";
import { db } from "../../../db";
import { subscriptions } from "../../../db/subscription-schema";
import { members } from "../../../db/schema";

export const Route = createFileRoute("/api/checkout/paystack-verify")({
  server: {
    handlers: {
      /**
       * POST /api/checkout/paystack-verify
       *
       * Verifies a Paystack transaction after popup success,
       * stores the authorization, and activates the subscription.
       */
      POST: async ({ request }) => {

        // Get user session
        const session = await auth.api.getSession({
          headers: request.headers,
        });

        if (!session?.user) {
          return Response.json({ error: "Authentication required." }, { status: 401 });
        }

        let body: { reference: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request body." }, { status: 400 });
        }

        const { reference } = body;
        if (!reference) {
          return Response.json(
            { error: "Transaction reference is required." },
            { status: 400 },
          );
        }

        try {
          // Verify the transaction with Paystack
          const verification = await verifyTransaction(reference);

          if (verification.data.status !== "success") {
            return Response.json(
              {
                error: "Transaction was not successful.",
                status: verification.data.status,
                gatewayResponse: verification.data.gateway_response,
              },
              { status: 400 },
            );
          }

          // Check if authorization is reusable
          const authorization = verification.data.authorization;
          if (!authorization.reusable) {
            return Response.json(
              {
                error:
                  "This card does not support recurring payments. Please try a different card.",
              },
              { status: 400 },
            );
          }

          // Extract metadata
          const metadata = verification.data.metadata as {
            organizationId?: string;
            plan?: string;
            userId?: string;
          };

          if (!metadata.organizationId || !metadata.plan || !metadata.userId) {
            return Response.json(
              { error: "Invalid transaction metadata." },
              { status: 400 },
            );
          }

          const { organizationId, plan, userId } = metadata;

          // Verify that the transaction was initiated by the current user
          if (userId !== session.user.id) {
            return Response.json(
              { error: "Transaction does not belong to the current user." },
              { status: 403 },
            );
          }

          // Verify user has admin/owner permissions for the organization
          const membership = await db.query.members.findFirst({
            where: and(
              eq(members.organizationId, organizationId),
              eq(members.userId, session.user.id),
            ),
          });

          if (!membership) {
            return Response.json(
              { error: "You are not a member of this organization." },
              { status: 403 },
            );
          }

          if (!["owner", "admin"].includes(membership.role)) {
            return Response.json(
              { error: "Only organization owners and admins can manage subscriptions." },
              { status: 403 },
            );
          }
          const customerEmail = verification.data.customer.email;
          const customerCode = verification.data.customer.customer_code;

          // Calculate next billing date (1 month from now)
          const currentPeriodEnd = new Date();
          currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

          // Check if subscription exists
          const existingSubscription = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.organizationId, organizationId))
            .limit(1);

          if (existingSubscription.length > 0) {
            // Update existing subscription
            await db
              .update(subscriptions)
              .set({
                plan,
                status: "active",
                paymentProvider: "paystack",
                paystackCustomerCode: customerCode,
                paystackAuthorizationCode: authorization.authorization_code,
                paystackEmail: customerEmail,
                currentPeriodEnd,
                cancelAtPeriodEnd: false,
                canceledAt: null,
                updatedAt: new Date(),
              })
              .where(eq(subscriptions.organizationId, organizationId));
          } else {
            // Create new subscription
            await db.insert(subscriptions).values({
              id: crypto.randomUUID(),
              organizationId,
              plan,
              status: "active",
              paymentProvider: "paystack",
              paystackCustomerCode: customerCode,
              paystackAuthorizationCode: authorization.authorization_code,
              paystackEmail: customerEmail,
              currentPeriodEnd,
              cancelAtPeriodEnd: false,
            });
          }

          console.log(
            `[Paystack Verify] Subscription activated for org ${organizationId}, plan: ${plan}`,
          );

          return Response.json({
            success: true,
            plan,
            currentPeriodEnd: currentPeriodEnd.toISOString(),
            card: {
              last4: authorization.last4,
              cardType: authorization.card_type,
              bank: authorization.bank,
              expMonth: authorization.exp_month,
              expYear: authorization.exp_year,
            },
          });
        } catch (error) {
          console.error("[Paystack Verify] Error:", error);
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to verify payment",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
