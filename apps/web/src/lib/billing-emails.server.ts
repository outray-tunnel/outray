import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { pool } from "../db";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { subscriptions } from "../db/subscription-schema";
import { enqueueProductEmail } from "../../../../shared/product-email-outbox";
import {
  subscriptionChangeEvents,
  nextBillingUpdatedAt,
  type BillingSubscriptionState,
} from "./billing-email-policy";

/** Commit the subscription and its durable notification together. The advisory
 * lock also serializes checkout verification/webhook races before a row exists. */
export async function withBillingEmailTransaction<T>(
  lockKey: string,
  work: (database: NodePgDatabase<typeof schema>, client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
    const result = await work(drizzle(client, { schema }), client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function enqueueSubscriptionChanges(
  client: PoolClient,
  organizationId: string,
  eventKey: string,
  previous: BillingSubscriptionState | null,
  next: BillingSubscriptionState,
  endedAt: Date | string | null = null,
): Promise<void> {
  for (const event of subscriptionChangeEvents(previous, next, endedAt)) {
    if (event.kind !== "subscription-change") continue;
    await enqueueProductEmail(client, {
      organizationId,
      eventKey: `${eventKey}:${event.change}`,
      event,
    });
  }
}

/** Shared by the popup verification and charge.success webhook so concurrent
 * delivery observes one transition and queues one confirmation. */
export async function applyPaystackCheckout(input: {
  organizationId: string;
  reference: string;
  plan?: string;
  interval: "month" | "year";
  customerCode: string;
  authorizationCode: string;
  customerEmail: string;
  currentPeriodEnd: Date;
}): Promise<void> {
  await withBillingEmailTransaction(`billing:organization:${input.organizationId}`, async (database, client) => {
    const [previous] = await database.select().from(subscriptions)
      .where(eq(subscriptions.organizationId, input.organizationId)).limit(1).for("update");
    const plan = input.plan || previous?.plan;
    if (!plan) return;
    const next = {
      plan,
      status: "active",
      paymentProvider: "paystack",
      paystackCustomerCode: input.customerCode,
      paystackAuthorizationCode: input.authorizationCode,
      paystackEmail: input.customerEmail,
      billingInterval: input.interval,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      updatedAt: nextBillingUpdatedAt(previous?.updatedAt),
    };
    if (previous) {
      await database.update(subscriptions).set(next)
        .where(eq(subscriptions.organizationId, input.organizationId));
    } else {
      await database.insert(subscriptions).values({
        id: crypto.randomUUID(), organizationId: input.organizationId, ...next,
      });
    }
    await enqueueSubscriptionChanges(client, input.organizationId,
      `paystack:checkout:${input.reference}`, previous ?? null, next);
  });
}
