import { createFileRoute } from "@tanstack/react-router";
import { Webhooks } from "@polar-sh/tanstack-start";
import { subscriptions } from "../../../db/subscription-schema";
import { eq } from "drizzle-orm";
import {
  enqueueSubscriptionChanges,
  withBillingEmailTransaction,
} from "../../../lib/billing-emails.server";
import {
  billingPeriodKey,
  billingTransitionRevision,
  nextBillingUpdatedAt,
} from "../../../lib/billing-email-policy";
import { enqueueProductEmail } from "../../../../../../shared/product-email-outbox";

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
    await applyPolarSubscriptionChange(subscription, {
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
    }, true);

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
  const { plan, interval } = mapPolarProductToPlan(subscription.productId);

  try {
    await applyPolarSubscriptionChange(subscription, {
      plan,
      status: "active",
      billingInterval: interval,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd)
        : null,
      updatedAt: new Date(),
    });

    console.log("[Polar Webhook] Activated subscription:", subscription.id);
  } catch (error) {
    console.error("[Polar Webhook] Error activating subscription:", error);
    throw error;
  }
}

async function handleSubscriptionUpdated(subscription: any) {
  const { plan, interval } = mapPolarProductToPlan(subscription.productId);
  // Polar also emits updated for revocation. Neither its delivery order nor a
  // later terminal-state update should restore the subscribed product's quota.
  // Scheduled cancellation and recoverable past_due keep their existing policy.
  const accessEnded =
    subscription.endedAt != null ||
    subscription.status === "unpaid" ||
    (subscription.status === "canceled" && !subscription.cancelAtPeriodEnd);

  try {
    await applyPolarSubscriptionChange(subscription, {
      plan: accessEnded ? "free" : plan,
      status: subscription.status,
      billingInterval: interval,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd)
        : null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
      updatedAt: new Date(),
    });

    console.log("[Polar Webhook] Updated subscription:", subscription.id);
  } catch (error) {
    console.error("[Polar Webhook] Error updating subscription:", error);
    throw error;
  }
}

async function handleSubscriptionCanceled(subscription: any) {
  try {
    await applyPolarSubscriptionChange(subscription, {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
      canceledAt: new Date(),
      updatedAt: new Date(),
    });

    console.log("[Polar Webhook] Canceled subscription:", subscription.id);
  } catch (error) {
    console.error("[Polar Webhook] Error canceling subscription:", error);
    throw error;
  }
}

async function handleSubscriptionUncanceled(subscription: any) {
  try {
    await applyPolarSubscriptionChange(subscription, {
      status: "active",
      cancelAtPeriodEnd: false,
      canceledAt: null,
      updatedAt: new Date(),
    });

    console.log("[Polar Webhook] Uncanceled subscription:", subscription.id);
  } catch (error) {
    console.error("[Polar Webhook] Error uncanceling subscription:", error);
    throw error;
  }
}

async function handleSubscriptionRevoked(subscription: any) {
  // Revocation ends paid capacity; cancel-at-period-end keeps it until then.
  // This handles new events only: historical revoked rows need explicit
  // reconciliation and are not automatically repaired by deploying this code.
  try {
    await applyPolarSubscriptionChange(subscription, {
      plan: "free",
      status: "cancelled",
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    });

    console.log("[Polar Webhook] Revoked subscription:", subscription.id);
  } catch (error) {
    console.error("[Polar Webhook] Error revoking subscription:", error);
    throw error;
  }
}

async function applyPolarSubscriptionChange(
  subscription: any,
  values: Partial<typeof subscriptions.$inferInsert>,
  create = false,
): Promise<void> {
  await withBillingEmailTransaction(`billing:polar:${subscription.id}`, async (database, client) => {
    const [previous] = await database.select().from(subscriptions)
      .where(eq(subscriptions.polarSubscriptionId, subscription.id)).limit(1).for("update");
    // created/active can both arrive for the same initial purchase. A replay of
    // created must not reset a subscription changed by a later lifecycle event.
    if (create && previous) return;
    if (!create && !previous) return;
    let next: typeof subscriptions.$inferSelect;
    if (create) {
      const [inserted] = await database.insert(subscriptions)
        .values(values as typeof subscriptions.$inferInsert).returning();
      next = inserted;
    } else {
      const [updated] = await database.update(subscriptions).set({
        ...values,
        updatedAt: nextBillingUpdatedAt(previous.updatedAt),
      })
        .where(eq(subscriptions.polarSubscriptionId, subscription.id)).returning();
      next = updated;
    }
    // Polar normally sends its own billing emails. Opt in only after disabling
    // equivalent provider emails to avoid duplicate customer notifications.
    if (process.env.POLAR_OUTRAY_EMAILS !== "true") return;
    const revision = billingTransitionRevision(subscription.modifiedAt, previous?.updatedAt, next);
    const eventKey = `polar:subscription:${subscription.id}:${billingPeriodKey(subscription.currentPeriodStart ?? subscription.currentPeriodEnd ?? null)}:${revision}`;
    await enqueueSubscriptionChanges(client, next.organizationId, eventKey,
      previous ?? null, next, subscription.endedAt ?? null);
    if (next.status === "past_due" && previous?.status !== "past_due" &&
        Number.isSafeInteger(subscription.amount) && subscription.amount >= 0 &&
        typeof subscription.currency === "string") {
      await enqueueProductEmail(client, {
        organizationId: next.organizationId,
        eventKey: `${eventKey}:payment-failed`,
        event: {
          kind: "payment-failed", plan: next.plan, amountMinor: subscription.amount,
          currency: subscription.currency.toUpperCase(), provider: "polar",
          periodEnd: next.currentPeriodEnd?.toISOString() ?? null,
        },
      });
    }
  });
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
