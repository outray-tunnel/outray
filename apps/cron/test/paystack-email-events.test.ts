import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const expiredAt = new Date("2026-01-01T00:00:00.000Z");
function subscription(cancel = false) {
  return {
    id: "subscription-1", organization_id: "org-1", plan: "beam", status: "active",
    billing_interval: "month", payment_provider: "paystack", cancel_at_period_end: cancel,
    current_period_end: expiredAt, paystack_authorization_code: "secret-authorization",
    paystack_email: "payer@example.test",
  };
}

async function cronHarness(cancel: boolean, failQueue = false) {
  let rows = [subscription(cancel)];
  const queued: Array<{ organizationId: string; eventKey: string; event: Record<string, unknown> }> = [];
  const operations: string[] = [];
  let fetches = 0;
  const pool = { async connect() {
    let snapshot = rows.map((row) => ({ ...row }));
    const staged: typeof queued = [];
    return {
      staged,
      async query(sql: string, values: unknown[] = []) {
        const operation = sql.trim().split(/\s+/).slice(0, 2).join(" ");
        operations.push(operation);
        if (sql === "BEGIN") snapshot = rows.map((row) => ({ ...row }));
        if (sql === "ROLLBACK") rows = snapshot;
        if (sql === "COMMIT") {
          for (const input of staged) if (!queued.some((item) => item.eventKey === input.eventKey)) queued.push(input);
        }
        if (sql.includes("DELETE FROM subscriptions")) {
          const expired = rows.filter((row) => row.cancel_at_period_end);
          rows = rows.filter((row) => !row.cancel_at_period_end);
          return { rows: expired, rowCount: expired.length };
        }
        if (sql.startsWith("SELECT id")) {
          return { rows: rows.filter((row) => row.status === "active" && !row.cancel_at_period_end) };
        }
        if (sql.includes("SET status = 'past_due'")) {
          assert.match(sql, /current_period_end = \$2/);
          const matches = rows.filter((row) => row.id === values[0] && row.current_period_end === values[1]);
          for (const row of matches) row.status = "past_due";
          return { rows: matches, rowCount: matches.length };
        }
        return { rows: [], rowCount: 0 };
      },
      release() { operations.push("release"); },
    };
  } };
  const path = new URL("../src/lib/paystack.ts", import.meta.url);
  const { outputText } = ts.transpileModule(await readFile(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} as { chargePaystackSubscriptions: () => Promise<void> } };
  const modules: Record<string, unknown> = {
    pg: { Pool: function () { return pool; } },
    "../config": { config: { databaseUrl: "not-a-real-database", paystackSecretKey: "test-only" } },
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
    process: { env: {} }, Date, Promise,
    console: { log() {}, error() {}, warn() {} },
    fetch: async () => { fetches++; return { ok: true, json: async () => ({ status: false, message: "Card declined" }) }; },
    setTimeout: (callback: () => void) => callback(),
  });
  return { ...module.exports, queued, operations, rows: () => rows, fetches: () => fetches };
}

test("Paystack renewal failure commits past_due and one safe period-keyed email", async () => {
  const harness = await cronHarness(false);
  await harness.chargePaystackSubscriptions();
  assert.equal(harness.rows()[0].status, "past_due");
  assert.equal(harness.queued.length, 1);
  assert.match(harness.queued[0].eventKey, /subscription-1:2026-01-01T00:00:00.000Z:payment-failed$/);
  assert.equal(harness.queued[0].event.amountMinor, 21000 * 100);
  assert.equal(harness.queued[0].event.currency, "NGN");
  assert.doesNotMatch(JSON.stringify(harness.queued), /secret-authorization|payer@example/);
  assert.equal(harness.operations[harness.operations.indexOf("enqueue") + 1], "COMMIT");
  await harness.chargePaystackSubscriptions();
  assert.equal(harness.queued.length, 1);
  assert.equal(harness.fetches(), 1);
});

test("Paystack failure queue errors roll back status for a later job", async () => {
  const harness = await cronHarness(false, true);
  await harness.chargePaystackSubscriptions();
  assert.equal(harness.rows()[0].status, "active");
  assert.equal(harness.queued.length, 0);
  assert.ok(harness.operations.includes("ROLLBACK"));
});

test("expired Paystack cancellation queues ended email in the same delete transaction", async () => {
  const harness = await cronHarness(true);
  await harness.chargePaystackSubscriptions();
  assert.equal(harness.rows().length, 0);
  assert.equal(harness.fetches(), 0);
  assert.equal(harness.queued.length, 1);
  assert.equal(harness.queued[0].event.change, "ended");
  assert.equal(harness.queued[0].event.plan, "beam");
  assert.equal(harness.queued[0].event.effectiveAt, expiredAt.toISOString());
  assert.equal(harness.operations[harness.operations.indexOf("enqueue") + 1], "COMMIT");
  await harness.chargePaystackSubscriptions();
  assert.equal(harness.queued.length, 1);
});

test("expired cancellation is retained when its ended email cannot be queued", async () => {
  const harness = await cronHarness(true, true);
  await harness.chargePaystackSubscriptions();
  assert.equal(harness.rows().length, 1);
  assert.equal(harness.queued.length, 0);
  assert.ok(harness.operations.includes("ROLLBACK"));
  assert.equal(harness.fetches(), 0);
});
