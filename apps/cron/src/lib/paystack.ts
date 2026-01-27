/**
 * Paystack Recurring Billing
 *
 * Charges Paystack subscriptions that are due for renewal.
 * Uses Charge Authorization model - we store the card token and charge it ourselves.
 */

import { Pool } from "pg";
import { config } from "../config";

// Kobo pricing (same as web app)
const PAYSTACK_PRICES_KOBO: Record<string, number> = {
  ray: 10000 * 100, // ₦10,000
  beam: 21000 * 100, // ₦21,000
  pulse: 170000 * 100, // ₦170,000
};

const PAYSTACK_API_URL = "https://api.paystack.co";

// Database pool for subscription queries
const dbPool = new Pool({
  connectionString: config.databaseUrl,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

interface Subscription {
  id: string;
  organization_id: string;
  plan: string;
  paystack_authorization_code: string;
  paystack_email: string;
  current_period_end: Date;
}

/**
 * Charge a stored authorization
 */
async function chargeAuthorization(
  authorizationCode: string,
  email: string,
  amount: number,
  reference: string,
  metadata: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetch(
      `${PAYSTACK_API_URL}/transaction/charge_authorization`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.paystackSecretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          authorization_code: authorizationCode,
          email,
          amount,
          reference,
          metadata,
        }),
      },
    );

    const data = await response.json() as {
      status: boolean;
      message: string;
      data?: {
        status: string;
        paused?: boolean;
        authorization_url?: string;
        gateway_response?: string;
      };
    };

    if (!response.ok || data.status === false) {
      return { success: false, error: data.message || "Charge failed" };
    }

    // Check if charge was successful or needs 2FA
    if (data.data?.status === "success") {
      return { success: true, data: data.data };
    } else if (data.data?.paused) {
      // 2FA required - user needs to authorize
      return {
        success: false,
        error: "2FA_REQUIRED",
        data: { authorizationUrl: data.data.authorization_url },
      };
    } else {
      return {
        success: false,
        error: data.data?.gateway_response || "Charge failed",
      };
    }
  } catch (error) {
    console.error("[Paystack] Charge error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate unique reference for transaction
 */
function generateReference(): string {
  return `outray_renewal_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get subscriptions due for renewal
 */
async function getDueSubscriptions(): Promise<Subscription[]> {
  const client = await dbPool.connect();
  try {
    const result = await client.query<Subscription>(
      `SELECT id, organization_id, plan, paystack_authorization_code, paystack_email, current_period_end
       FROM subscriptions
       WHERE payment_provider = 'paystack'
         AND status = 'active'
         AND paystack_authorization_code IS NOT NULL
         AND paystack_email IS NOT NULL
         AND current_period_end <= NOW()`,
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Update subscription after successful charge
 */
async function updateSubscriptionSuccess(subscriptionId: string): Promise<void> {
  const client = await dbPool.connect();
  try {
    const nextPeriodEnd = new Date();
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

    await client.query(
      `UPDATE subscriptions
       SET current_period_end = $1, status = 'active', updated_at = NOW()
       WHERE id = $2`,
      [nextPeriodEnd, subscriptionId],
    );
  } finally {
    client.release();
  }
}

/**
 * Update subscription after failed charge
 */
async function updateSubscriptionFailed(
  subscriptionId: string,
  reason: string,
): Promise<void> {
  const client = await dbPool.connect();
  try {
    await client.query(
      `UPDATE subscriptions
       SET status = 'past_due', updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId],
    );
    console.log(
      `[Paystack] Subscription ${subscriptionId} marked as past_due: ${reason}`,
    );
  } finally {
    client.release();
  }
}

/**
 * Main function to charge due Paystack subscriptions
 */
export async function chargePaystackSubscriptions(): Promise<void> {
  if (!config.paystackSecretKey) {
    console.log("[Paystack] No secret key configured, skipping charge job");
    return;
  }

  console.log("[Paystack] Starting recurring charge job...");

  try {
    const dueSubscriptions = await getDueSubscriptions();
    console.log(`[Paystack] Found ${dueSubscriptions.length} subscriptions due for renewal`);

    for (const subscription of dueSubscriptions) {
      const amount = PAYSTACK_PRICES_KOBO[subscription.plan];
      if (!amount) {
        console.warn(
          `[Paystack] Unknown plan ${subscription.plan} for subscription ${subscription.id}`,
        );
        continue;
      }

      const reference = generateReference();

      console.log(
        `[Paystack] Charging subscription ${subscription.id} (${subscription.plan}): ₦${amount / 100}`,
      );

      const result = await chargeAuthorization(
        subscription.paystack_authorization_code,
        subscription.paystack_email,
        amount,
        reference,
        {
          organizationId: subscription.organization_id,
          plan: subscription.plan,
          isRenewal: true,
        },
      );

      if (result.success) {
        await updateSubscriptionSuccess(subscription.id);
        console.log(
          `[Paystack] Successfully charged subscription ${subscription.id}`,
        );
      } else {
        await updateSubscriptionFailed(subscription.id, result.error || "Unknown error");
        // TODO: Send failed payment email to user
      }

      // Small delay between charges to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log("[Paystack] Recurring charge job completed");
  } catch (error) {
    console.error("[Paystack] Recurring charge job failed:", error);
  }
}
