import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import pg from "pg";
import ts from "typescript";
import * as security from "../src/lib/security";
import { renderSubscriptionConfirmationEmail } from "../src/lib/subscription-email";

function loadModule<T>(path: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, {
    module, exports: module.exports, URL, Date, Error, Response, Request, FormData, AbortSignal, console,
    process: { env: { NODE_ENV: "development" } }, ...globals,
    require: (specifier: string) => {
      if (!(specifier in imports)) throw new Error(`Unexpected import: ${specifier}`);
      return imports[specifier];
    },
  });
  return module.exports as T;
}

test("actual public subscription SQL respects pauses, consent preservation, confirmation races and signed unsubscribe", {
  skip: process.env.OUTRAY_RUN_DB_INTEGRATION !== "1",
}, async (t) => {
  const connectionString = process.env.OUTRAY_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Set OUTRAY_TEST_DATABASE_URL to a migrated disposable database");
  const databaseUrl = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname.toLowerCase()) ||
      !/test/i.test(databaseUrl.pathname)) throw new Error("Subscription mutations require a disposable loopback test database");
  // Deliberately never use DATABASE_URL, and all mail delivery is mocked.
  const pool = new pg.Pool({ connectionString, ssl: false });
  const organizationId = crypto.randomUUID();
  const pageId = crypto.randomUUID();
  const pendingId = crypto.randomUUID();
  const confirmedId = crypto.randomUUID();
  const token = security.newToken();
  let mailCount = 0;
  let pauseBeforeLock = false;
  let pauseBeforeSend = false;
  let mailFails = false;
  const config = { enabled: true, zeptoApiKey: "fake-integration-key", fromEmail: "no-reply@example.test", publicUrl: new URL("https://status.example.test/") };
  t.after(async () => {
    try { await pool.query("DELETE FROM organizations WHERE id=$1", [organizationId]); }
    finally { await pool.end(); }
  });
  await pool.query("INSERT INTO organizations (id,name,slug,created_at) VALUES ($1,'Public subscription fixture',$1,NOW())", [organizationId]);
  await pool.query("INSERT INTO uptime_status_pages (id,organization_id,slug,name,published,subscriptions_enabled) VALUES ($1,$2,$1,'Public fixture',true,false)", [pageId, organizationId]);
  await pool.query(`INSERT INTO uptime_subscribers
    (id,organization_id,page_id,email,status,token_hash,token_expires_at,confirmed_at)
    VALUES ($1,$2,$3,'pending@example.test','pending',$4,NOW()+INTERVAL '1 hour',NULL),
           ($5,$2,$3,'confirmed@example.test','confirmed',NULL,NULL,NOW())`,
  [pendingId, organizationId, pageId, security.tokenHash(token), confirmedId]);
  const db = {
    query: async (sql: string, parameters: unknown[] = []) => (await pool.query(sql, parameters)).rows,
    getPool: () => ({ connect: async () => {
      const client = await pool.connect();
      return {
        release: () => client.release(),
        query: async (sql: string, parameters: unknown[] = []) => {
          if (pauseBeforeLock && sql.includes("FROM uptime_status_pages") && sql.includes("FOR UPDATE")) {
            pauseBeforeLock = false;
            await pool.query("UPDATE uptime_status_pages SET subscriptions_enabled=false WHERE id=$1", [pageId]);
          }
          if (pauseBeforeSend && sql.includes("FROM uptime_status_pages") && sql.includes("FOR SHARE")) {
            pauseBeforeSend = false;
            await pool.query("UPDATE uptime_status_pages SET subscriptions_enabled=false WHERE id=$1", [pageId]);
          }
          return client.query(sql, parameters);
        },
      };
    } }),
  };
  const reader = loadModule<{
    findPublishedPageById: (id: string) => Promise<{ subscriptions_enabled: boolean }>;
  }>("../src/lib/status-data.ts", { "./db": db, "./config": { statusPageUrl: () => new URL("https://fixture.status.example.test/") }, "./runtime": { statusEnvironment: () => ({}), isStatusProduction: () => false } });
  const api = loadModule<{
    requestSubscription: (pageId: string, email: string, ip: string) => Promise<string>;
    inspectConfirmation: (token: string) => Promise<unknown>;
    confirmSubscription: (token: string) => Promise<unknown>;
    unsubscribe: (token: string) => Promise<unknown>;
  }>("../src/lib/subscriptions.ts", {
    "node:crypto": crypto, "./config": { getStatusConfig: () => config }, "./db": db,
    "./status-data": reader, "./security": security,
    "./runtime": { statusEnvironment: () => ({}) },
    "./subscription-email": { renderSubscriptionConfirmationEmail },
  }, { fetch: async () => { mailCount++; return new Response("{}", { status: mailFails ? 503 : 200 }); } });
  const state = async () => (await pool.query("SELECT id,status,token_hash,token_expires_at,confirmed_at FROM uptime_subscribers WHERE page_id=$1 ORDER BY id", [pageId])).rows;
  const pause = (enabled: boolean) => pool.query("UPDATE uptime_status_pages SET subscriptions_enabled=$2 WHERE id=$1", [pageId, enabled]);

  await t.test("disabled flag is projected publicly and preserves every existing consent record", async () => {
    const original = await state();
    assert.equal((await reader.findPublishedPageById(pageId)).subscriptions_enabled, false);
    assert.equal(await api.requestSubscription(pageId, "new@example.test", "127.0.0.1"), "disabled");
    assert.equal(await api.inspectConfirmation(token), null);
    assert.equal(await api.confirmSubscription(token), null);
    assert.deepEqual(await state(), original);
    assert.equal(mailCount, 0);
  });
  await t.test("signed unsubscribe remains available even while subscriptions are off", async () => {
    const signed = security.makeUnsubscribeToken(confirmedId, pageId, Date.now() + 60_000);
    assert.ok(await api.unsubscribe(signed));
    assert.equal((await pool.query("SELECT status FROM uptime_subscribers WHERE id=$1", [confirmedId])).rows[0].status, "unsubscribed");
  });
  await t.test("confirmation cannot slip through if an admin pauses after its lookup", async () => {
    await pause(true);
    pauseBeforeLock = true;
    assert.equal(await api.confirmSubscription(token), null);
    assert.equal((await pool.query("SELECT status FROM uptime_subscribers WHERE id=$1", [pendingId])).rows[0].status, "pending");
    assert.equal((await reader.findPublishedPageById(pageId)).subscriptions_enabled, false);
  });
  await t.test("signup cannot slip through if an admin pauses after its lookup", async () => {
    await pause(true);
    pauseBeforeLock = true;
    assert.equal(await api.requestSubscription(pageId, "race@example.test", "127.0.0.1"), "disabled");
    assert.equal((await pool.query("SELECT COUNT(*)::integer AS count FROM uptime_subscribers WHERE page_id=$1", [pageId])).rows[0].count, 2);
    assert.equal(mailCount, 0);
  });
  await t.test("re-enabling retains valid pending confirmation and normal double opt-in", async () => {
    await pause(true);
    assert.ok(await api.inspectConfirmation(token));
    assert.ok(await api.confirmSubscription(token));
    assert.equal((await pool.query("SELECT status FROM uptime_subscribers WHERE id=$1", [pendingId])).rows[0].status, "confirmed");
    assert.equal(await api.requestSubscription(pageId, "new@example.test", "127.0.0.1"), "sent");
    const [pending] = (await pool.query("SELECT status,token_hash,confirmed_at FROM uptime_subscribers WHERE page_id=$1 AND email='new@example.test'", [pageId])).rows;
    assert.equal(pending.status, "pending");
    assert.equal(pending.confirmed_at, null);
    assert.ok(pending.token_hash);
    assert.equal(mailCount, 1);
  });
  await t.test("a pause after signup commit prevents the confirmation email from starting", async () => {
    await pause(true);
    pauseBeforeSend = true;
    assert.equal(await api.requestSubscription(pageId, "paused-send@example.test", "127.0.0.2"), "disabled");
    assert.equal(mailCount, 1);
    assert.equal((await pool.query("SELECT status FROM uptime_subscribers WHERE page_id=$1 AND email='paused-send@example.test'", [pageId])).rows[0].status, "pending");
  });
  await t.test("failed mail delivery does not erase pending consent or rate-limit records", async () => {
    await pause(true);
    mailFails = true;
    await assert.rejects(api.requestSubscription(pageId, "failed-mail@example.test", "127.0.0.3"), /Confirmation email delivery failed/);
    assert.equal(mailCount, 2);
    assert.equal((await pool.query("SELECT status FROM uptime_subscribers WHERE page_id=$1 AND email='failed-mail@example.test'", [pageId])).rows[0].status, "pending");
    assert.equal((await pool.query("SELECT COUNT(*)::integer AS count FROM uptime_subscription_attempts WHERE page_id=$1", [pageId])).rows[0].count, 3);
  });
});
