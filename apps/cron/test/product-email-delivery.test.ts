import assert from "node:assert/strict";
import test from "node:test";
import { enqueueProductEmail } from "../../../shared/product-email-outbox";
import { createProductEmailWorker } from "../src/lib/product-emails";

const environment = { OUTRAY_DEPLOYMENT_MODE: "hosted", ZEPTO_API_KEY: "fake-provider-key", APP_URL: "https://outray.co" };
const event = { kind: "payment-failed" as const, plan: "beam", amountMinor: 2_100_000, currency: "NGN", provider: "paystack" as const, periodEnd: "2026-10-16T00:00:00.000Z" };
const sample = { id: "email-1", organization_id: "org-1", recipient: "owner@example.net", payload: event, attempts: 1 };

function harness(options: { rows?: typeof sample[]; member?: boolean; higher?: boolean; status?: number; reject?: boolean } = {}) {
  const queries: Array<{ sql: string; values: any[] }> = [];
  const requests: Array<{ url: string; body: any }> = [];
  const logs: string[] = [];
  let rows = options.rows ?? [sample];
  const database = {
    async query(sql: string, values: any[] = []) {
      queries.push({ sql, values });
      if (sql.startsWith("WITH due")) { const claimed = rows; rows = []; return { rows: claimed }; }
      if (sql.startsWith("SELECT organization.name")) return { rows: options.member === false ? [] : [{ name: "Acme", slug: "acme" }] };
      if (sql.startsWith("SELECT 1 FROM product_email_outbox")) return { rows: options.higher ? [{}] : [] };
      return { rows: [] };
    },
  };
  const request: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    assert.ok(init?.signal);
    if (options.reject) throw new Error("private-provider-response-fake-provider-key");
    return new Response(null, { status: options.status ?? 200 });
  };
  return { database, queries, requests, request, logs, logger: { error: (message: unknown) => { logs.push(String(message)); } } };
}

test("outbox persistence derives verified owner/admin recipients and deduplicates atomically", async () => {
  const calls: Array<{ sql: string; values: any[] }> = [];
  const database = { async query(sql: string, values: any[] = []) { calls.push({ sql, values }); return { rows: [{ id: "queued" }], rowCount: 1 }; } };
  assert.equal(await enqueueProductEmail(database, { organizationId: "org-1", eventKey: "failure:sub-1:2026-10", event }), 1);
  assert.match(calls[0].sql, /SELECT DISTINCT lower\(app_user.email\)/);
  assert.match(calls[0].sql, /member.role IN \('owner', 'admin'\)/);
  assert.match(calls[0].sql, /app_user.email_verified = true/);
  assert.match(calls[0].sql, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  assert.equal(calls[0].values[1], "org-1");
  assert.equal(calls[0].values[2], "failure:sub-1:2026-10");
  assert.deepEqual(JSON.parse(calls[0].values[3]), event);
});

test("delivery uses hosted OutRay sender and current organization billing link", async () => {
  const h = harness();
  const worker = createProductEmailWorker(h.database, { environment, fetch: h.request, logger: h.logger });
  await worker.run();
  await worker.run();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.requests[0].body.from, { address: "no-reply@outray.co", name: "OutRay" });
  assert.equal(h.requests[0].url, "https://api.zeptomail.com/v1.1/email");
  assert.match(h.requests[0].body.htmlbody, /https:\/\/outray.co\/acme\/billing/);
  assert.match(h.requests[0].body.subject, /Acme/);
  const claim = h.queries.find(query => query.sql.startsWith("WITH due"));
  assert.match(claim!.sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(claim!.sql, /attempts = email.attempts \+ 1/);
  assert.match(h.queries.find(query => query.sql.includes("status = 'sent'"))!.sql, /WHERE id = \$1 AND lease_owner = \$2/);
  await worker.shutdown();
});

test("self-hosted and unconfigured workers leave the queue untouched", async () => {
  for (const env of [{ ...environment, OUTRAY_DEPLOYMENT_MODE: "self-hosted" }, { ...environment, ZEPTO_API_KEY: "" }]) {
    const h = harness();
    await createProductEmailWorker(h.database, { environment: env, fetch: h.request, logger: h.logger }).run();
    assert.equal(h.queries.length, 0);
    assert.equal(h.requests.length, 0);
  }
});

test("removed or demoted recipients are suppressed before contacting provider", async () => {
  const h = harness({ member: false });
  await createProductEmailWorker(h.database, { environment, fetch: h.request, logger: h.logger }).run();
  assert.equal(h.requests.length, 0);
  assert.ok(h.queries.some(query => query.sql.includes("status = 'suppressed'")));
});

test("invalid persisted payload fails permanently instead of sending", async () => {
  const h = harness({ rows: [{ ...sample, payload: { ...event, amountMinor: -1 } }] });
  await createProductEmailWorker(h.database, { environment, fetch: h.request, logger: h.logger }).run();
  assert.equal(h.requests.length, 0);
  assert.ok(h.queries.some(query => query.values[2] === "failed" && query.values[4] === "Invalid stored email event"));
});

test("transient provider failures retry with backoff; permanent failures and exhausted attempts stop", async () => {
  for (const [status, attempts, expected, delay] of [[429, 1, "pending", 30], [500, 2, "pending", 60], [422, 1, "failed", 30], [500, 5, "failed", 480]] as const) {
    const h = harness({ status, rows: [{ ...sample, attempts }] });
    await createProductEmailWorker(h.database, { environment, fetch: h.request, logger: h.logger }).run();
    const result = h.queries.find(query => query.sql.includes("next_attempt_at = NOW() +"));
    assert.equal(result?.values[2], expected);
    assert.equal(result?.values[3], delay);
    assert.equal(result?.values[4], `Email provider returned HTTP ${status}`);
  }
});

test("network failure details do not leak into logs or stored errors", async () => {
  const h = harness({ reject: true });
  await createProductEmailWorker(h.database, { environment, fetch: h.request, logger: h.logger }).run();
  assert.doesNotMatch(JSON.stringify(h.queries) + JSON.stringify(h.logs), /private-provider-response|fake-provider-key/);
});

test("provider credential failures keep queued messages retryable without exhausting attempts", async () => {
  for (const status of [401, 403]) {
    const h = harness({ status, rows: [{ ...sample, attempts: 5 }] });
    await createProductEmailWorker(h.database, { environment, fetch: h.request, logger: h.logger }).run();
    const retry = h.queries.find(query => query.sql.includes("next_attempt_at = NOW() +"));
    assert.equal(retry?.values[2], "pending");
    assert.equal(retry?.values[3], 300);
    assert.equal(retry?.values[5], 1);
    assert.match(retry!.sql, /attempts = GREATEST\(attempts - \$6, 0\)/);
  }
});

test("expired monthly warnings and superseded 80% warnings are suppressed", async () => {
  const usage = { kind: "usage-warning" as const, metric: "bandwidth" as const, threshold: 80 as const, usedBytes: 800, limitBytes: 1000, resetsAt: "2026-11-01T00:00:00.000Z" };
  for (const expired of [true, false]) {
    const h = harness({ higher: !expired, rows: [{ ...sample, payload: usage as any }] });
    await createProductEmailWorker(h.database, {
      environment, fetch: h.request, logger: h.logger,
      clock: () => new Date(expired ? "2026-11-01T00:00:00Z" : "2026-10-16T00:00:00Z"),
    }).run();
    assert.equal(h.requests.length, 0);
    assert.ok(h.queries.some(query => query.sql.includes("status = 'suppressed'")));
  }
});

test("single-flight polling and shutdown wait for in-flight delivery", async () => {
  const h = harness();
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const worker = createProductEmailWorker(h.database, {
    environment, logger: h.logger,
    fetch: async (url, init) => { started(); await gate; return h.request(url, init); },
  });
  const first = worker.run();
  assert.equal(first, worker.run());
  await ready;
  let stopped = false;
  const shutdown = worker.shutdown().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  finish();
  await shutdown;
  await worker.run();
  assert.equal(h.requests.length, 1);
});
