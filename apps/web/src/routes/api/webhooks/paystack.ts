import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookSignature } from "../../../lib/paystack";
import { db } from "../../../db";
import { subscriptions } from "../../../db/subscription-schema";
import { eq, and } from "drizzle-orm";
import { applyPaystackCheckout } from "../../../lib/billing-emails.server";

export const Route = createFileRoute("/api/webhooks/paystack")({
  server: {
    handlers: {
      /**
       * POST /api/webhooks/paystack
       *
       * Handles Paystack webhook events.
       * Primary event: charge.success (for both initial and recurring payments)
       */
      POST: async ({ request }) => {
        // Get raw body for signature verification
        const body = await request.text();

        // Verify webhook signature
        const signature = request.headers.get("x-paystack-signature");
        if (!signature) {
          console.warn("[Paystack Webhook] Missing signature header");
          return Response.json({ error: "Missing signature" }, { status: 400 });
        }

        if (!verifyWebhookSignature(body, signature)) {
          console.warn("[Paystack Webhook] Invalid signature");
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }

        // Parse the event
        let event: {
          event: string;
          data: Record<string, unknown>;
        };

        try {
          event = JSON.parse(body);
        } catch {
          console.warn("[Paystack Webhook] Invalid JSON body");
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        console.log(`[Paystack Webhook] Received event: ${event.event}`);

        try {
          switch (event.event) {
            case "charge.success":
              await handleChargeSuccess(event.data);
              break;

            default:
              console.log(
                `[Paystack Webhook] Unhandled event type: ${event.event}`,
              );
          }

          return Response.json({ received: true });
        } catch (error) {
          console.error("[Paystack Webhook] Error processing event:", error);
          return Response.json(
            { error: "Failed to process webhook" },
            { status: 500 },
          );
        }
      },
    },
  },
});

interface ChargeSuccessData {
  reference: string;
  status: string;
  amount: number;
  metadata?: {
    organizationId?: string;
    plan?: string;
    interval?: "month" | "year";
    isRenewal?: boolean;
  };
  customer: {
    email: string;
    customer_code: string;
  };
  authorization: {
    authorization_code: string;
    card_type: string;
    last4: string;
    exp_month: string;
    exp_year: string;
    bank: string;
    reusable: boolean;
  };
}

async function handleChargeSuccess(data: unknown) {
  const chargeData = data as ChargeSuccessData;

  console.log(
    `[Paystack Webhook] charge.success - Reference: ${chargeData.reference}`,
  );

  const metadata = chargeData.metadata;
  if (!metadata?.organizationId) {
    console.log(
      "[Paystack Webhook] No organizationId in metadata, skipping...",
    );
    return;
  }

  const { organizationId, plan, interval = "month", isRenewal } = metadata;

  // Calculate next billing date based on interval
  const currentPeriodEnd = new Date();
  if (interval === "year") {
    currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
  } else {
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
  }

  if (isRenewal) {
    // This is a recurring charge from cron job
    await db
      .update(subscriptions)
      .set({
        status: "active",
        currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(subscriptions.organizationId, organizationId),
          eq(subscriptions.paymentProvider, "paystack"),
        ),
      );

    console.log(
      `[Paystack Webhook] Renewal processed for org ${organizationId}, interval: ${interval}`,
    );
  } else {
    // Initial payment - update or create subscription
    await applyPaystackCheckout({
      organizationId,
      reference: chargeData.reference,
      plan,
      interval,
      customerCode: chargeData.customer.customer_code,
      authorizationCode: chargeData.authorization.authorization_code,
      customerEmail: chargeData.customer.email,
      currentPeriodEnd,
    });

    console.log(
      `[Paystack Webhook] Initial payment processed for org ${organizationId}, plan: ${plan}, interval: ${interval}`,
    );
  }
}
