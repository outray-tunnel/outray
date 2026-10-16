import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import hostedPlans from "../../../shared/hosted-plan-limits";
import { loadRouteHandlers } from "./helpers/load-route";
import { billingPeriodKey, billingTransitionRevision, nextBillingUpdatedAt, subscriptionChangeEvents } from "../src/lib/billing-email-policy";
import type { ProductEmailEvent } from "../../../shared/product-email";

const { HOSTED_PLAN_LIMITS } = hostedPlans;
const routePath = new URL(
  "../src/routes/api/webhooks/polar.ts",
  import.meta.url,
);
const productEnvironment = {
  POLAR_WEBHOOK_SECRET: "offline-test-secret",
  POLAR_PRODUCT_RAY: "ray-month",
  POLAR_PRODUCT_BEAM: "beam-month",
  POLAR_PRODUCT_PULSE: "pulse-month",
  POLAR_PRODUCT_RAY_YEARLY: "ray-year",
  POLAR_PRODUCT_BEAM_YEARLY: "beam-year",
  POLAR_PRODUCT_PULSE_YEARLY: "pulse-year",
};

type SubscriptionRow = {
  organizationId: string;
  polarSubscriptionId: string | null;
  plan: keyof typeof HOSTED_PLAN_LIMITS;
  status: string;
  billingInterval: "month" | "year";
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date | null;
  updatedAt?: Date;
};

type PolarSubscription = {
  id: string;
  productId: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  metadata: { organizationId: string };
  endedAt?: string | null;
  amount?: number;
  currency?: string;
  modifiedAt?: Date | null;
};

type Callbacks = Record<
  string,
  (payload: { data: PolarSubscription; type?: string }) => Promise<void>
>;

async function lifecycleHarness(ownEmails = false) {
  const rows: SubscriptionRow[] = [
    {
      organizationId: "org-target",
      polarSubscriptionId: "polar-target",
      plan: "beam",
      status: "active",
      billingInterval: "year",
      currentPeriodEnd: new Date("2999-01-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
    },
    {
      organizationId: "org-unrelated",
      polarSubscriptionId: "polar-unrelated",
      plan: "pulse",
      status: "active",
      billingInterval: "month",
      currentPeriodEnd: new Date("2999-01-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
    },
    {
      organizationId: "org-other-provider",
      polarSubscriptionId: null,
      plan: "ray",
      status: "active",
      billingInterval: "month",
      currentPeriodEnd: new Date("2999-01-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
    },
  ];
  const subscriptionTable = { polarSubscriptionId: "polarSubscriptionId" };
  let callbacks: Callbacks | undefined;
  const mutations: Array<{ field: string; value: string }> = [];
  const queued: Array<{ eventKey: string; event: ProductEmailEvent }> = [];
  const queue = (input: typeof queued[number]) => {
    if (!queued.some(({ eventKey }) => eventKey === input.eventKey)) queued.push(input);
  };
  const source = `const process = ${JSON.stringify({ env: { ...productEnvironment, ...(ownEmails ? { POLAR_OUTRAY_EMAILS: "true" } : {}) } })};\nconst crypto = { randomUUID: () => "test-subscription-id" };\n${await readFile(routePath, "utf8")}`;
  const database = {
    select() {
      return { from() { return { where(condition: { field: string; value: string }) {
        return { limit() { return { async for() {
          return rows.filter((row) => row.polarSubscriptionId === condition.value).map((row) => ({ ...row }));
        } }; } };
      } }; } };
    },
    insert() {
      return { values(values: SubscriptionRow) { return { async returning() {
        const row = { updatedAt: new Date("2026-10-01T00:00:00Z"), ...values };
        rows.push(row);
        return [row];
      } }; } };
    },
    update(table: unknown) {
      assert.equal(table, subscriptionTable);
      return { set(values: Partial<SubscriptionRow>) {
        return { where(condition: { field: string; value: string }) {
          assert.equal(condition.field, "polarSubscriptionId");
          mutations.push(condition);
          return { async returning() {
            const matching = rows.filter((row) => row.polarSubscriptionId === condition.value);
            for (const row of matching) Object.assign(row, values);
            return matching.map((row) => ({ ...row }));
          } };
        } };
      } };
    },
  };

  await loadRouteHandlers({
    path: routePath,
    source,
    logger: { log() {}, warn() {}, error() {} },
    modules: {
      "@polar-sh/tanstack-start": {
        Webhooks(options: Callbacks & { webhookSecret: string }) {
          assert.equal(options.webhookSecret, "offline-test-secret");
          callbacks = options;
          return async () => new Response(null, { status: 200 });
        },
      },
      "../../../lib/billing-emails.server": {
        withBillingEmailTransaction: async (_key: string, work: (db: unknown, client: unknown) => Promise<void>) => work(database, {}),
        enqueueSubscriptionChanges: async (_client: unknown, _organizationId: string, eventKey: string, previous: SubscriptionRow | null, next: SubscriptionRow) => {
          for (const event of subscriptionChangeEvents(previous, next)) {
            if (event.kind === "subscription-change") queue({
              eventKey: `${eventKey}:${event.change}`,
              event,
            });
          }
        },
      },
      "../../../lib/billing-email-policy": { billingPeriodKey, billingTransitionRevision, nextBillingUpdatedAt },
      "../../../../../../shared/product-email-outbox": { enqueueProductEmail: async (_client: unknown, input: { eventKey: string; event: ProductEmailEvent }) => { queue(input); } },
      "../../../db/subscription-schema": { subscriptions: subscriptionTable },
      "drizzle-orm": {
        eq: (field: string, value: string) => ({ field, value }),
      },
    },
  });

  assert.ok(callbacks);
  const subscription: PolarSubscription = {
    id: "polar-target",
    productId: "beam-year",
    status: "active",
    currentPeriodEnd: "2999-02-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    metadata: { organizationId: "org-target" },
  };
  return { rows, callbacks, subscription, mutations, queued };
}

test("Polar revocation immediately changes paid capacity to Free", async () => {
  const { rows, callbacks, subscription } = await lifecycleHarness();
  const unrelated = structuredClone(rows.slice(1));
  rows[0].cancelAtPeriodEnd = true;

  await callbacks.onSubscriptionRevoked({ data: subscription });

  assert.equal(rows[0].plan, "free");
  assert.equal(rows[0].status, "cancelled");
  assert.equal(rows[0].cancelAtPeriodEnd, false);
  assert.equal(rows[0].billingInterval, "year");
  assert.equal(
    HOSTED_PLAN_LIMITS[rows[0].plan].telemetryBytesPerMonth,
    1024 ** 3,
  );
  assert.equal(HOSTED_PLAN_LIMITS[rows[0].plan].maxUptimeMonitors, 5);
  assert.deepEqual(rows.slice(1), unrelated);
});

for (const plan of ["ray", "beam", "pulse"] as const) {
  for (const interval of ["month", "year"] as const) {
    test(`Polar activation restores ${plan} / ${interval} after revocation`, async () => {
      const { rows, callbacks, subscription } = await lifecycleHarness();
      await callbacks.onSubscriptionRevoked({ data: subscription });
      const unrelated = structuredClone(rows.slice(1));

      await callbacks.onSubscriptionActive({
        data: { ...subscription, productId: `${plan}-${interval}` },
      });

      assert.equal(rows[0].plan, plan);
      assert.equal(rows[0].billingInterval, interval);
      assert.equal(rows[0].status, "active");
      assert.equal(
        rows[0].currentPeriodEnd.toISOString(),
        subscription.currentPeriodEnd,
      );
      assert.deepEqual(rows.slice(1), unrelated);
    });
  }
}

test("cancel-at-period-end preserves paid capacity until revocation", async () => {
  const { rows, callbacks, subscription } = await lifecycleHarness();
  const priorCapacity = HOSTED_PLAN_LIMITS[rows[0].plan];
  const periodEnd = rows[0].currentPeriodEnd.toISOString();

  await callbacks.onSubscriptionCanceled({
    data: { ...subscription, status: "canceled", cancelAtPeriodEnd: true },
  });

  assert.equal(rows[0].plan, "beam");
  assert.equal(rows[0].billingInterval, "year");
  assert.equal(rows[0].cancelAtPeriodEnd, true);
  assert.equal(rows[0].status, "canceled");
  assert.ok(rows[0].canceledAt instanceof Date);
  assert.equal(rows[0].currentPeriodEnd.toISOString(), periodEnd);
  assert.equal(HOSTED_PLAN_LIMITS[rows[0].plan], priorCapacity);

  await callbacks.onSubscriptionRevoked({ data: subscription });
  assert.equal(rows[0].plan, "free");
});

test("webhooks update only the matching Polar subscription, not metadata organization", async () => {
  const { rows, callbacks, subscription, mutations } = await lifecycleHarness();
  const unrelated = structuredClone(rows.slice(1));

  await callbacks.onSubscriptionRevoked({
    data: { ...subscription, metadata: { organizationId: "org-unrelated" } },
  });

  assert.equal(rows[0].plan, "free");
  assert.deepEqual(rows.slice(1), unrelated);
  assert.deepEqual(mutations, [
    { field: "polarSubscriptionId", value: "polar-target" },
  ]);

  const beforeUnknownEvent = structuredClone(rows);
  for (const event of [
    "onSubscriptionRevoked",
    "onSubscriptionActive",
    "onSubscriptionCanceled",
  ]) {
    await callbacks[event]({ data: { ...subscription, id: "polar-unknown" } });
  }
  assert.deepEqual(rows, beforeUnknownEvent);
});

test("unknown product activation does not grant a paid plan", async () => {
  const { rows, callbacks, subscription } = await lifecycleHarness();

  await callbacks.onSubscriptionActive({
    data: { ...subscription, productId: "unconfigured-product" },
  });

  assert.equal(rows[0].plan, "free");
  assert.equal(rows[0].billingInterval, "month");
});

for (const status of ["canceled", "unpaid"]) {
  for (const order of ["revoked-first", "updated-first"]) {
    test(`terminal ${status} update cannot restore paid capacity (${order})`, async () => {
      const { rows, callbacks, subscription } = await lifecycleHarness();
      const unrelated = structuredClone(rows.slice(1));
      const terminal = {
        ...subscription,
        status,
        cancelAtPeriodEnd: false,
        endedAt: "2026-10-10T00:00:00.000Z",
      };
      const events =
        order === "revoked-first"
          ? ["onSubscriptionRevoked", "onSubscriptionUpdated"]
          : ["onSubscriptionUpdated", "onSubscriptionRevoked"];

      for (const event of events) {
        await callbacks[event]({ data: terminal });
        assert.equal(rows[0].plan, "free");
      }

      assert.deepEqual(rows.slice(1), unrelated);
    });
  }
}

test("Polar billing notifications remain provider-managed unless explicitly enabled", async () => {
  const { callbacks, subscription, queued } = await lifecycleHarness();
  await callbacks.onSubscriptionCanceled({ data: { ...subscription, status: "canceled", cancelAtPeriodEnd: true } });
  await callbacks.onSubscriptionRevoked({ data: subscription });
  assert.equal(queued.length, 0);
});

test("Polar cancellation, reversal, plan changes and ending each notify only on transition", async () => {
  const { callbacks, subscription, queued } = await lifecycleHarness(true);
  const canceled = { ...subscription, status: "canceled", cancelAtPeriodEnd: true };
  await callbacks.onSubscriptionCanceled({ data: canceled });
  await callbacks.onSubscriptionCanceled({ data: canceled });
  await callbacks.onSubscriptionUpdated({ data: canceled });
  await callbacks.onSubscriptionUncanceled({ data: subscription });
  await callbacks.onSubscriptionUncanceled({ data: subscription });
  const upgrade = { ...subscription, productId: "pulse-year" };
  await callbacks.onSubscriptionUpdated({ data: upgrade });
  await callbacks.onSubscriptionActive({ data: upgrade });
  await callbacks.onSubscriptionRevoked({ data: upgrade });
  await callbacks.onSubscriptionUpdated({ data: { ...upgrade, status: "unpaid" } });
  assert.deepEqual(queued.map(({ event }) => event.kind === "subscription-change" ? event.change : event.kind),
    ["cancellation-scheduled", "cancellation-reversed", "plan-changed", "ended"]);
});

test("Polar created and active callbacks share one initial activation", async () => {
  const { rows, callbacks, subscription, queued } = await lifecycleHarness(true);
  rows.shift();
  await callbacks.onSubscriptionCreated({ data: subscription });
  await callbacks.onSubscriptionCreated({ data: subscription });
  await callbacks.onSubscriptionActive({ data: subscription });
  assert.equal(queued.length, 1);
  assert.equal(queued[0].event.kind, "subscription-change");
  if (queued[0].event.kind === "subscription-change") assert.equal(queued[0].event.change, "activated");
  assert.equal(rows.filter((row) => row.polarSubscriptionId === subscription.id).length, 1);
});

test("Polar incomplete creation waits until activation to send confirmation", async () => {
  const { rows, callbacks, subscription, queued } = await lifecycleHarness(true);
  rows.shift();
  await callbacks.onSubscriptionCreated({ data: { ...subscription, status: "incomplete" } });
  assert.equal(queued.length, 0);
  await callbacks.onSubscriptionActive({ data: subscription });
  assert.equal(queued.length, 1);
});

test("Polar past-due updates queue one safe payment-failed notice", async () => {
  const { rows, callbacks, subscription, queued } = await lifecycleHarness(true);
  const pastDue = { ...subscription, status: "past_due", amount: 21000, currency: "usd" };
  await callbacks.onSubscriptionUpdated({ data: pastDue });
  await callbacks.onSubscriptionUpdated({ data: pastDue });
  assert.equal(rows[0].status, "past_due");
  assert.equal(rows[0].plan, "beam");
  assert.equal(queued.length, 1);
  assert.equal(queued[0].event.kind, "payment-failed");
  if (queued[0].event.kind === "payment-failed") assert.equal(queued[0].event.currency, "USD");
  assert.match(queued[0].eventKey, /polar-target/);
  assert.doesNotMatch(JSON.stringify(queued), /authorization|card|customer/);
});

for (const providerRevision of [true, false]) {
  test(`Polar same-period repeated transitions have distinct identities (${providerRevision ? "modifiedAt" : "stored revision"})`, async () => {
    const { callbacks, subscription, queued } = await lifecycleHarness(true);
    const payload = (revision: number, overrides: Partial<PolarSubscription>) => ({
      ...subscription,
      ...(providerRevision ? { modifiedAt: new Date(`2026-10-16T10:00:0${revision}.000Z`) } : {}),
      ...overrides,
    });
    const canceled = payload(1, { status: "canceled", cancelAtPeriodEnd: true });
    await callbacks.onSubscriptionCanceled({ data: canceled });
    await callbacks.onSubscriptionCanceled({ data: canceled });
    const uncanceled = payload(2, {});
    await callbacks.onSubscriptionUncanceled({ data: uncanceled });
    await callbacks.onSubscriptionUncanceled({ data: uncanceled });
    const canceledAgain = payload(3, { status: "canceled", cancelAtPeriodEnd: true });
    await callbacks.onSubscriptionCanceled({ data: canceledAgain });
    await callbacks.onSubscriptionCanceled({ data: canceledAgain });
    const schedules = queued.filter(({ event }) => event.kind === "subscription-change" && event.change === "cancellation-scheduled");
    assert.equal(schedules.length, 2);
    assert.notEqual(schedules[0].eventKey, schedules[1].eventKey);
    // Return to an uncanceled state before testing A -> B -> A -> B.
    await callbacks.onSubscriptionUncanceled({ data: payload(4, {}) });
    for (const [revision, productId] of [[5, "pulse-year"], [6, "beam-year"], [7, "pulse-year"]] as const) {
      const changed = payload(revision, { productId });
      await callbacks.onSubscriptionUpdated({ data: changed });
      await callbacks.onSubscriptionUpdated({ data: changed });
    }
    const upgrades = queued.filter(({ event }) => event.kind === "subscription-change" && event.change === "plan-changed" && event.plan === "pulse");
    assert.equal(upgrades.length, 2);
    assert.notEqual(upgrades[0].eventKey, upgrades[1].eventKey);
    assert.equal(queued.length, 7);
    if (providerRevision) {
      // Replaying an old canceled callback after later changes must retain its
      // provider identity, even though the local plan has since changed.
      await callbacks.onSubscriptionCanceled({ data: canceled });
      assert.equal(queued.length, 7);
    }
  });
}

for (const status of ["active", "canceled", "past_due"]) {
  test(`${status} update before scheduled cancellation does not remove paid capacity`, async () => {
    const { rows, callbacks, subscription } = await lifecycleHarness();

    await callbacks.onSubscriptionUpdated({
      data: {
        ...subscription,
        status,
        cancelAtPeriodEnd: true,
        endedAt: null,
      },
    });

    assert.equal(rows[0].plan, "beam");
    assert.equal(rows[0].billingInterval, "year");
    assert.equal(rows[0].cancelAtPeriodEnd, true);
  });
}

test("recoverable past_due update retains capacity without inventing a grace period", async () => {
  const { rows, callbacks, subscription } = await lifecycleHarness();

  await callbacks.onSubscriptionUpdated({
    data: { ...subscription, status: "past_due", endedAt: null },
  });

  assert.equal(rows[0].plan, "beam");
  assert.equal(rows[0].status, "past_due");
});

for (const status of ["canceled", "unpaid"]) {
  test(`terminal ${status} status denies capacity even without endedAt`, async () => {
    const { rows, callbacks, subscription } = await lifecycleHarness();

    await callbacks.onSubscriptionUpdated({
      data: { ...subscription, status, endedAt: null },
    });

    assert.equal(rows[0].plan, "free");
  });
}
