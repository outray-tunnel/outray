import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { billingPeriodKey, nextBillingUpdatedAt, subscriptionChangeEvents } from "../src/lib/billing-email-policy";
import { loadRouteHandlers } from "./helpers/load-route";

async function billingHarness(failQueue = false) {
  let row: Record<string, unknown> | null = null;
  let serial = Promise.resolve();
  const operations: string[] = [];
  const queued: Array<{ eventKey: string; event: unknown }> = [];
  const database = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => {
      operations.push("read");
      return row ? [{ ...row }] : [];
    } }) }) }) }),
    insert: () => ({ values: async (values: Record<string, unknown>) => {
      operations.push("insert"); row = { ...values };
    } }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => {
      operations.push("update"); row = { ...row, ...values };
    } }) }),
  };
  const pool = { async connect() {
    let unlock: (() => void) | undefined;
    let snapshot: Record<string, unknown> | null = null;
    const staged: typeof queued = [];
    return {
      staged,
      async query(sql: string) {
        operations.push(sql);
        if (sql.startsWith("SELECT pg_advisory")) {
          const previous = serial;
          serial = new Promise<void>((resolve) => { unlock = resolve; });
          await previous;
          snapshot = row ? { ...row } : null;
        }
        if (sql === "COMMIT") { queued.push(...staged); unlock?.(); }
        if (sql === "ROLLBACK") { row = snapshot; unlock?.(); }
        return { rows: [] };
      },
      release() { operations.push("release"); },
    };
  } };
  const path = new URL("../src/lib/billing-emails.server.ts", import.meta.url);
  const { outputText } = ts.transpileModule(await readFile(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} as {
    applyPaystackCheckout: (input: unknown) => Promise<void>;
    withBillingEmailTransaction: typeof import("../src/lib/billing-emails.server").withBillingEmailTransaction;
    enqueueSubscriptionChanges: typeof import("../src/lib/billing-emails.server").enqueueSubscriptionChanges;
  } };
  const modules: Record<string, unknown> = {
    "drizzle-orm/node-postgres": { drizzle: () => database },
    "drizzle-orm": { eq: () => ({}) },
    "../db": { pool },
    "../db/schema": {},
    "../db/subscription-schema": { subscriptions: {} },
    "./billing-email-policy": { subscriptionChangeEvents, nextBillingUpdatedAt },
    "../../../../shared/product-email-outbox": { enqueueProductEmail: async (client: { staged: typeof queued }, input: typeof queued[number]) => {
      operations.push("enqueue");
      if (failQueue) throw new Error("queue unavailable");
      client.staged.push(input);
    } },
  };
  runInNewContext(outputText, {
    module, exports: module.exports,
    require: (specifier: string) => {
      if (!Object.hasOwn(modules, specifier)) throw new Error(`Unexpected dependency ${specifier}`);
      return modules[specifier];
    },
    Date, crypto: { randomUUID: () => "subscription-1" },
  });
  return { ...module.exports, queued, operations, row: () => row };
}

const checkout = {
  organizationId: "org-1", reference: "payment-1", plan: "ray", interval: "month",
  customerCode: "customer-secret", authorizationCode: "authorization-secret",
  customerEmail: "billing@example.test", currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
};

test("concurrent Paystack verification and webhook queue one activation without credentials", async () => {
  const harness = await billingHarness();
  await Promise.all([harness.applyPaystackCheckout(checkout), harness.applyPaystackCheckout(checkout)]);
  assert.equal(harness.queued.length, 1);
  assert.match(harness.queued[0].eventKey, /paystack:checkout:payment-1:activated/);
  assert.doesNotMatch(JSON.stringify(harness.queued), /secret|customerCode|authorizationCode/);
  assert.equal(harness.row()?.plan, "ray");
  assert.ok(harness.operations.indexOf("enqueue") < harness.operations.indexOf("COMMIT"));
});

test("outbox failure rolls back the subscription and allows a webhook retry", async () => {
  const harness = await billingHarness(true);
  await assert.rejects(harness.applyPaystackCheckout(checkout), /queue unavailable/);
  assert.equal(harness.row(), null);
  assert.equal(harness.queued.length, 0);
  assert.ok(harness.operations.includes("ROLLBACK"));
  assert.ok(!harness.operations.includes("COMMIT"));
  assert.equal(harness.operations.at(-1), "release");
});

test("Paystack cancel after checkout reversal queues another same-period cancellation", async () => {
  const harness = await billingHarness();
  await harness.applyPaystackCheckout(checkout);
  const handlers = await loadRouteHandlers<{
    POST: (input: { request: Request; params: { orgSlug: string } }) => Promise<Response>;
  }>({
    path: new URL("../src/routes/api/subscriptions/$orgSlug/cancel.ts", import.meta.url),
    logger: { log() {}, warn() {}, error() {} },
    modules: {
      "../../../../lib/auth": { auth: { api: { getSession: async () => ({ user: { id: "user-1" } }) } } },
      "../../../../db": { db: { query: {
        organizations: { findFirst: async () => ({ id: checkout.organizationId, slug: "test-org" }) },
        members: { findFirst: async () => ({ role: "owner" }) },
        subscriptions: { findFirst: async () => harness.row() },
      } } },
      "../../../../db/subscription-schema": { subscriptions: {} },
      "../../../../db/auth-schema": { organizations: {}, members: {} },
      "drizzle-orm": { eq() {}, and() {} },
      "../../../../lib/billing-emails.server": harness,
      "../../../../lib/billing-email-policy": { billingPeriodKey, nextBillingUpdatedAt },
    },
  });
  const cancel = async () => {
    const response = await handlers.POST({
      request: new Request("https://example.test/api/subscriptions/test-org/cancel", { method: "POST" }),
      params: { orgSlug: "test-org" },
    });
    assert.equal(response.status, 200);
  };
  await cancel();
  await cancel();
  await harness.applyPaystackCheckout({ ...checkout, reference: "payment-2" });
  await cancel();
  await cancel();
  const schedules = harness.queued.filter(({ event }) => (event as { change?: string }).change === "cancellation-scheduled");
  assert.equal(schedules.length, 2);
  assert.notEqual(schedules[0].eventKey, schedules[1].eventKey);
  assert.equal(harness.queued.length, 4);
});
