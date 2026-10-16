import assert from "node:assert/strict";
import * as nodeCrypto from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import emailDesign from "../../../shared/email-template";
import { safeDatabaseError, withDatabaseTransaction } from "../src/database";

async function workerHarness(options: {
  enabled?: boolean; status?: string; inactive?: boolean; source?: string;
  queryError?: Error; rollbackError?: Error; pollError?: Error;
  hangQuery?: boolean; hangSend?: boolean; transactionTimeoutMs?: number;
} = {}) {
  const source = await readFile(resolve(__dirname, "../src/notifications.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let sends = 0;
  let sendAborted = false;
  let transactionTimeoutMs: number | undefined;
  const notification = { id: "notification", organization_id: "tenant", source_id: "update", source_type: options.source ?? "uptime_incident_update",
    event: "published", channel: "email", recipient: "customer@example.test", attempts: 0,
    payload: { pageId: "page", pageSlug: "services", incidentId: "incident", updateId: "update", subscriberId: "subscriber", title: "Safe public title", note: "Safe note", status: "investigating" } };
  const client = Object.assign(new EventEmitter(), { query: async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql === "ROLLBACK" && options.rollbackError) throw options.rollbackError;
    if (sql.includes("SELECT subscriber.email") && options.queryError) throw options.queryError;
    if (sql.includes("SELECT subscriber.email") && options.hangQuery) return new Promise(() => {});
    if (sql.includes("SELECT subscriber.email")) return { rows: options.inactive ? [] : [{ email: notification.recipient,
      status: options.status ?? "confirmed", last_sent_at: null, page_slug: "services", published: true,
      subscriptions_enabled: options.enabled ?? true, published_at: new Date(), note: "Approved stored note", body_json: null }] };
    if (sql.includes("count(*)::int AS count")) return { rows: [{ count: 0 }] };
    return { rows: [{ id: "page" }], rowCount: 1 };
  }, release: (discard?: boolean) => { calls.push({ sql: "RELEASE", params: [discard] }); } });
  const pool = { query: async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("WITH due AS") && options.pollError) throw options.pollError;
    return { rows: sql.includes("WITH due AS") ? [notification] : [], rowCount: 1 };
  }, connect: async () => client };
  const module = { exports: {} as { pollUptimeNotifications: (pool: unknown) => Promise<void> } };
  runInNewContext(compiled, { Buffer, Date, URL, AbortSignal, process: { env: {} }, console, module, exports: module.exports,
    fetch: async (_url: string, init: RequestInit) => {
      sends++;
      if (options.hangSend) {
        await new Promise<void>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => {
            sendAborted = true;
            reject(init.signal!.reason);
          }, { once: true });
        });
      }
      return { ok: true };
    }, require: (specifier: string) => {
      if (specifier === "node:crypto") return nodeCrypto;
      if (specifier === "./database") return { safeDatabaseError,
        withDatabaseTransaction: (pool: Parameters<typeof withDatabaseTransaction>[0],
          work: Parameters<typeof withDatabaseTransaction>[1], settings: Parameters<typeof withDatabaseTransaction>[2]) => {
          transactionTimeoutMs = settings?.transactionTimeoutMs;
          return withDatabaseTransaction(pool, work, { ...settings,
            ...(options.transactionTimeoutMs === undefined ? {} : { transactionTimeoutMs: options.transactionTimeoutMs }) });
        } };
      if (specifier === "./config") return { config: { zeptoApiKey: "fake-test-token", statusPublicUrl: "https://status.example.test", unsubscribeSecret: "fake-test-signing-key" } };
      if (specifier === "@outray/incident-content") return { renderIncidentHtml: () => "Approved stored note" };
      if (specifier === "../../../shared/email-sender") return { emailSender: () => ({ address: "no-reply@example.test", name: "Status" }) };
      if (specifier === "../../../shared/email-template") return emailDesign;
      return {};
    } });
  await module.exports.pollUptimeNotifications(pool);
  return { calls, sends, sendAborted, transactionTimeoutMs };
}

test("disabled subscriptions pause already-queued emails without a send or consuming attempts", async () => {
  const result = await workerHarness({ enabled: false });
  assert.equal(result.sends, 0);
  const paused = result.calls.find((call) => call.sql.includes("subscriptions_disabled"));
  assert.ok(paused); assert.match(paused.sql, /status = 'pending'/);
  assert.doesNotMatch(paused.sql, /attempts\s*=/);
  assert.ok(result.calls.some((call) => call.sql === "COMMIT"));
});

test("queued mail checks live consent and tenant/page ownership before sending", async () => {
  for (const options of [{ status: "unsubscribed" }, { status: "pending" }, { inactive: true }]) {
    const result = await workerHarness(options);
    assert.equal(result.sends, 0);
    const suppressed = result.calls.find((call) => call.params.includes("subscriber_inactive"));
    assert.ok(suppressed); assert.ok(suppressed.params.includes("suppressed"));
  }
  const result = await workerHarness();
  assert.equal(result.sends, 1);
  assert.equal(result.transactionTimeoutMs, 20_000);
  const pageLock = result.calls.findIndex((call) => /WHERE id = \$1 AND organization_id = \$2 FOR SHARE/.test(call.sql));
  const subscriberLock = result.calls.findIndex((call) => call.sql.includes("FOR UPDATE OF subscriber"));
  const markedSent = result.calls.findIndex((call) => call.sql.includes("status = 'sent', attempts"));
  const commit = result.calls.findIndex((call) => call.sql === "COMMIT");
  assert.ok(pageLock >= 0 && pageLock < subscriberLock && subscriberLock < markedSent && markedSent < commit);
  assert.match(result.calls[subscriberLock].sql, /page.organization_id = \$3 AND update.organization_id = \$3/);
});

test("subscription control is not added to team delivery paths", async () => {
  const result = await workerHarness({ source: "uptime_monitor", enabled: false });
  assert.ok(!result.calls.some((call) => call.sql.includes("subscriptions_enabled")));
  assert.equal(result.calls.at(-1)?.params.includes("invalid_payload"), true);
});

test("subscriber DB timeout discards the client, records a retry, and the next poll can send", async () => {
  const timedOut = await workerHarness({ hangQuery: true, transactionTimeoutMs: 10 });
  assert.equal(timedOut.sends, 0);
  assert.deepEqual(timedOut.calls.find((call) => call.sql === "RELEASE")?.params, [true]);
  assert.ok(!timedOut.calls.some((call) => call.sql === "COMMIT" || call.sql === "ROLLBACK"));
  assert.equal(timedOut.calls.at(-1)?.params[4], "DB_TRANSACTION_TIMEOUT");
  const recovered = await workerHarness();
  assert.equal(recovered.sends, 1);
  assert.deepEqual(recovered.calls.find((call) => call.sql === "RELEASE")?.params, [false]);
});

test("subscriber deadline aborts the provider send and never marks it sent", async () => {
  const timedOut = await workerHarness({ hangSend: true, transactionTimeoutMs: 10 });
  assert.equal(timedOut.sends, 1);
  assert.equal(timedOut.sendAborted, true);
  assert.deepEqual(timedOut.calls.find((call) => call.sql === "RELEASE")?.params, [true]);
  assert.ok(!timedOut.calls.some((call) => call.sql.includes("status = 'sent', attempts") || call.sql === "COMMIT"));
});

test("subscriber rollback failure preserves the safe original DB error for retry", async (context) => {
  const log = context.mock.method(console, "error", () => {});
  const result = await workerHarness({
    queryError: Object.assign(new Error("private SQL value"), { code: "23503" }),
    rollbackError: Object.assign(new Error("private endpoint"), { code: "ECONNRESET" }),
  });
  assert.equal(result.sends, 0);
  assert.equal(result.calls.at(-1)?.params[4], "23503");
  assert.deepEqual(result.calls.find((call) => call.sql === "RELEASE")?.params, [true]);
  assert.doesNotMatch(JSON.stringify(log.mock.calls.map((call) => call.arguments)), /private SQL|private endpoint/);
});

test("notification poll logs only safe database diagnostics", async (context) => {
  const log = context.mock.method(console, "error", () => {});
  await workerHarness({ pollError: Object.assign(new Error("credential-bearing SQL"), { code: "https://secret@private.example" }) });
  assert.deepEqual(JSON.parse(JSON.stringify(log.mock.calls.map((call) => call.arguments))), [
    ["[Uptime] Notification poll failed", { code: "internal_error", category: "database_error" }],
  ]);
});
