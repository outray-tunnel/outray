import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import hostedPlans from "../../../shared/hosted-plan-limits";
import { loadRouteHandlers } from "./helpers/load-route";

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
};

type Callbacks = Record<
  string,
  (payload: { data: PolarSubscription }) => Promise<void>
>;

async function lifecycleHarness() {
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
  const source = `const process = ${JSON.stringify({ env: productEnvironment })};\n${await readFile(routePath, "utf8")}`;

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
      "../../../db": {
        db: {
          update(table: unknown) {
            assert.equal(table, subscriptionTable);
            return {
              set(values: Partial<SubscriptionRow>) {
                return {
                  async where(condition: { field: string; value: string }) {
                    assert.equal(condition.field, "polarSubscriptionId");
                    mutations.push(condition);
                    for (const row of rows) {
                      if (row.polarSubscriptionId === condition.value) {
                        Object.assign(row, values);
                      }
                    }
                  },
                };
              },
            };
          },
        },
      },
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
  return { rows, callbacks, subscription, mutations };
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
