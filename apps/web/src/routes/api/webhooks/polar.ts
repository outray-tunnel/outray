import { createFileRoute } from "@tanstack/react-router";
import { Webhooks } from "@polar-sh/tanstack-start";
import { db } from "../../../db";
import { subscriptions } from "../../../db/subscription-schema";
import { eq } from "drizzle-orm";

export const Route = createFileRoute("/api/webhooks/polar")({
  server: {
    handlers: {
      POST: Webhooks({
        webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,

        onSubscriptionCreated: async (payload) => {
          console.log("[Polar Webhook] Subscription created:", payload.data.id);
          await handleSubscriptionCreated(payload.data);
        },

        onSubscriptionActive: async (payload) => {
          console.log("[Polar Webhook] Subscription active:", payload.data.id);
          await handleSubscriptionActive(payload.data);
        },

        onSubscriptionUpdated: async (payload) => {
          console.log("[Polar Webhook] Subscription updated:", payload.data.id);
          await handleSubscriptionUpdated(payload.data);
        },

        onSubscriptionCanceled: async (payload) => {
          console.log(
            "[Polar Webhook] Subscription canceled:",
            payload.data.id,
          );
          await handleSubscriptionCanceled(payload.data);
        },

        onSubscriptionUncanceled: async (payload) => {
          console.log(
            "[Polar Webhook] Subscription uncanceled:",
            payload.data.id,
          );
          await handleSubscriptionUncanceled(payload.data);
        },

        onSubscriptionRevoked: async (payload) => {
          console.log("[Polar Webhook] Subscription revoked:", payload.data.id);
          await handleSubscriptionRevoked(payload.data);
        },

        onPayload: async (payload) => {
          console.log("[Polar Webhook] Received event:", payload.type);
        },
      }),
    },
  },
});

async function handleSubscriptionCreated(subscription: any) {
  const { plan, interval } = mapPolarProductToPlan(subscription.productId);

  try {
    await db.insert(subscriptions).values({
      id: crypto.randomUUID(),
      organizationId: subscription.metadata?.organizationId as string,
      plan,
      status: subscription.status,
      polarCustomerId: subscription.customerId,
      polarSubscriptionId: subscription.id,
      polarProductId: subscription.productId,
      billingInterval: interval,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd)
        : null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
    });

    console.log(
      "[Polar Webhook] Created subscription:",
      subscription.id,
      "for organization:",
      subscription.metadata?.organizationId,
      "plan:",
      plan,
      "interval:",
      interval,
    );
  } catch (error) {
    console.error("[Polar Webhook] Error creating subscription:", error);
    throw error;
  }
}

async function handleSubscriptionActive(subscription: any) {
  try {
    await db
      .update(subscriptions)
      .set({
        status: "active",
        currentPeriodEnd: subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.polarSubscriptionId, subscription.id));

    console.log("[Polar Webhook] Activated subscription:", subscription.id);
  } catch (error) {
    console.error("[Polar Webhook] Error activating subscription:", error);
    throw error;
  }
}

async function handleSubscriptionUpdated(subscription: any) {
  const { plan, interval } = mapPolarProductToPlan(subscription.productId);

  try {
    await db
      .update(subscriptions)
      .set({
        plan,
        status: subscription.status,
        billingInterval: interval,
        currentPeriodEnd: subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd)
          : null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.polarSubscriptionId, subscription.id));

    console.log("[Polar Webhook] Updated subscription:", subscription.id);
  } catch (error) {
    console.error("[Polar Webhook] Error updating subscription:", error);
    throw error;
  }
}

async function handleSubscriptionCanceled(subscription: any) {
  try {
    await db
      .update(subscriptions)
      .set({
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
        canceledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.polarSubscriptionId, subscription.id));

    console.log("[Polar Webhook] Canceled subscription:", subscription.id);
  } catch (error) {
    console.error("[Polar Webhook] Error canceling subscription:", error);
    throw error;
  }
}

async function handleSubscriptionUncanceled(subscription: any) {
  try {
    await db
      .update(subscriptions)
      .set({
        status: "active",
        cancelAtPeriodEnd: false,
        canceledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.polarSubscriptionId, subscription.id));

    console.log("[Polar Webhook] Uncanceled subscription:", subscription.id);
  } catch (error) {
    console.error("[Polar Webhook] Error uncanceling subscription:", error);
    throw error;
  }
}

async function handleSubscriptionRevoked(subscription: any) {
  try {
    await db
      .update(subscriptions)
      .set({
        status: "cancelled",
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.polarSubscriptionId, subscription.id));

    console.log("[Polar Webhook] Revoked subscription:", subscription.id);
  } catch (error) {
    console.error("[Polar Webhook] Error revoking subscription:", error);
    throw error;
  }
}

function mapPolarProductToPlan(productId: string): {
  plan: string;
  interval: "month" | "year";
} {
  const productPlanMap: Record<
    string,
    { plan: string; interval: "month" | "year" }
  > = {
    // Monthly products
    [process.env.POLAR_PRODUCT_RAY!]: { plan: "ray", interval: "month" },
    [process.env.POLAR_PRODUCT_BEAM!]: { plan: "beam", interval: "month" },
    [process.env.POLAR_PRODUCT_PULSE!]: { plan: "pulse", interval: "month" },
    // Yearly products
    [process.env.POLAR_PRODUCT_RAY_YEARLY!]: { plan: "ray", interval: "year" },
    [process.env.POLAR_PRODUCT_BEAM_YEARLY!]: {
      plan: "beam",
      interval: "year",
    },
    [process.env.POLAR_PRODUCT_PULSE_YEARLY!]: {
      plan: "pulse",
      interval: "year",
    },
  };

  return productPlanMap[productId] || { plan: "free", interval: "month" };
}
