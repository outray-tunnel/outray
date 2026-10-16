import assert from "node:assert/strict";
import * as nodeCrypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as drizzleOperators from "drizzle-orm";
import * as subscriberApi from "../src/lib/uptime/subscriber-api";
import { publishUptimeUpdate } from "../src/lib/uptime/incident-api";
import emailDesign from "../../../shared/email-template";
import databaseSafety from "../../uptime-probe/src/database";

const enabled = process.env.OUTRAY_RUN_DB_INTEGRATION === "1";

test("real subscriber API and delivery preserve consent, isolate tenants, and serialize the off switch", { skip: !enabled }, async (t) => {
  const databaseUrl = process.env.OUTRAY_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("Set OUTRAY_TEST_DATABASE_URL to a migrated disposable database");
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase()) || !url.pathname.includes("test")) {
    throw new Error("Subscriber fixture mutations require an explicitly selected local test database");
  }
  const [{ drizzle }, { default: pg }, schema] = await Promise.all([
    import("drizzle-orm/node-postgres"), import("pg"), import("../src/db/schema"),
  ]);
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: false });
  const db = drizzle(pool, { schema });
  const suffix = nodeCrypto.randomUUID();
  const id = (name: string) => `subscriber-test-${name}-${suffix}`;
  const organizationId = id("org"), otherOrganizationId = id("other-org"), pageId = id("page");
  const otherPageId = id("other-page"), subscriberId = id("confirmed"), pendingId = id("pending");
  const incidentId = id("incident"), updateId = id("update");
  const now = new Date(), old = new Date(now.getTime() - 60_000);
  t.after(async () => {
    try { await db.delete(schema.organizations).where(drizzleOperators.inArray(schema.organizations.id, [organizationId, otherOrganizationId])); }
    finally { await pool.end(); }
  });
  await db.insert(schema.organizations).values([
    { id: organizationId, slug: id("workspace"), name: "Subscribers test", createdAt: now },
    { id: otherOrganizationId, slug: id("other-workspace"), name: "Other tenant", createdAt: now },
  ]);
  await db.insert(schema.uptimeStatusPages).values([
    { id: pageId, organizationId, slug: `subscribers-${suffix}`, name: "Services", published: true },
    { id: otherPageId, organizationId: otherOrganizationId, slug: `other-${suffix}`, name: "Foreign services", published: true },
  ]);
  await db.insert(schema.uptimeSubscribers).values([
    { id: subscriberId, organizationId, pageId, email: "confirmed@example.test", status: "confirmed", confirmedAt: old, createdAt: now },
    { id: pendingId, organizationId, pageId, email: "pending_100%literal@example.test", status: "pending", tokenHash: "private-confirmation-token", tokenExpiresAt: new Date(now.getTime() + 3_600_000), createdAt: now },
    { id: id("unsubscribed"), organizationId, pageId, email: "unsubscribed@example.test", status: "unsubscribed", unsubscribedAt: old, createdAt: old },
    { id: id("foreign"), organizationId: otherOrganizationId, pageId: otherPageId, email: "foreign@example.test", status: "confirmed", createdAt: now },
  ]);
  await db.insert(schema.incidents).values({ id: incidentId, organizationId, sourceType: "uptime_manual", sourceId: incidentId,
    title: "Customer-approved incident", sourceSnapshot: {}, status: "open", startedAt: now });
  await db.insert(schema.uptimeIncidentUpdates).values({ id: updateId, organizationId, incidentId, note: "Approved public details", status: "investigating", publishedAt: now });

  async function route(filename: string, method: "GET" | "PATCH", denied = false) {
    const source = await readFile(new URL(`../src/routes/api/$orgSlug/uptime/subscribers/${filename}`, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    type Handler = (input: { request: Request; params: { orgSlug: string; subscriberId?: string } }) => Promise<Response>;
    const module = { exports: {} as { Route: { server: { handlers: Record<string, Handler> } } } };
    runInNewContext(compiled, { Response, URL, Date, Buffer, module, exports: module.exports, require: (specifier: string) => {
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (definition: unknown) => definition };
      if (specifier === "drizzle-orm") return drizzleOperators;
      if (specifier === "@/db") return { db };
      if (specifier === "@/db/uptime-schema") return schema;
      if (specifier === "@/lib/uptime/subscriber-api") return subscriberApi;
      if (specifier === "@/lib/uptime/api") return {
        requireUptimeManager: async (_request: Request, orgSlug: string) => {
          assert.equal(orgSlug, "url-workspace");
          return denied ? { error: Response.json({ error: "Forbidden" }, { status: 403 }) } : { organization: { id: organizationId } };
        },
        jsonBody: async (request: Request) => {
          try { const body = await request.json(); return body && typeof body === "object" && !Array.isArray(body) ? body : Response.json({ error: "Invalid JSON object" }, { status: 400 }); }
          catch { return Response.json({ error: "Invalid JSON object" }, { status: 400 }); }
        },
        badInput: (error: string, field?: string) => Response.json({ error, field }, { status: 400 }),
        notFound: (label: string) => Response.json({ error: `${label} not found` }, { status: 404 }),
      };
      throw new Error(`Unexpected subscriber API dependency: ${specifier}`);
    } });
    return (body?: unknown, query = "", requestedSubscriberId = subscriberId) => module.exports.Route.server.handlers[method]({
      request: new Request(`https://integration.invalid/api/url-workspace/uptime/subscribers${query}`, { method,
        ...(method === "GET" ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }),
      params: { orgSlug: "url-workspace", subscriberId: requestedSubscriberId },
    });
  }
  const list = await route("index.ts", "GET"), settings = await route("settings.ts", "PATCH"), remove = await route("$subscriberId.ts", "PATCH");
  const readSubscriber = async (target = subscriberId) => (await db.select().from(schema.uptimeSubscribers).where(drizzleOperators.eq(schema.uptimeSubscribers.id, target)))[0];

  await t.test("manager lists exact scoped counts, secret-free records, literal search, status filters and tied-date pagination", async () => {
    const response = await list(undefined, "?limit=1");
    assert.equal(response.status, 200);
    const first = await response.json();
    assert.equal(first.subscriptionsEnabled, true);
    assert.deepEqual(first.counts, { all: 3, pending: 1, confirmed: 1, unsubscribed: 1 });
    assert.equal(first.subscribers.length, 1); assert.ok(first.nextCursor);
    assert.deepEqual(Object.keys(first.subscribers[0]).sort(), ["id", "email", "status", "createdAt", "confirmedAt", "unsubscribedAt", "lastSentAt"].sort());
    const second = await (await list(undefined, `?limit=1&cursor=${first.nextCursor}`)).json();
    const third = await (await list(undefined, `?limit=1&cursor=${second.nextCursor}`)).json();
    assert.equal(new Set([first, second, third].map((page) => page.subscribers[0].id)).size, 3);
    assert.equal(third.nextCursor, null);
    assert.ok([first, second, third].every((page) => page.subscribers[0].email !== "foreign@example.test"));
    const pending = await (await list(undefined, "?status=pending&q=_100%25literal")).json();
    assert.equal(pending.subscribers.length, 1); assert.equal(pending.subscribers[0].id, pendingId);
    assert.deepEqual(pending.counts, first.counts, "counts remain page totals, not search totals");
    assert.equal((await list(undefined, "?cursor=invalid")).status, 400);
    assert.equal((await list(undefined, "?status=admin")).status, 400);
    assert.equal((await (await route("index.ts", "GET", true))()).status, 403);
  });

  await t.test("strict off switch preserves subscriptions and leaves publication enabled without newly queuing emails", async () => {
    for (const body of [{}, { subscriptionsEnabled: "false" }, { subscriptionsEnabled: false, published: false }, { published: false }]) assert.equal((await settings(body)).status, 400);
    assert.equal((await settings({ subscriptionsEnabled: false })).status, 200);
    const disabled = await (await list()).json();
    assert.equal(disabled.subscriptionsEnabled, false); assert.equal(disabled.counts.all, 3);
    assert.equal((await readSubscriber()).status, "confirmed");
    const result = await db.transaction((tx) => publishUptimeUpdate(tx, { organizationId, incidentId, updateId,
      title: "Customer-approved incident", affectedComponentIds: [], note: "Approved public details", status: "investigating",
      componentStates: {}, applyManualLifecycle: true, now }));
    assert.deepEqual(result, { success: true, recipients: 0 });
    assert.equal((await db.select().from(schema.notifications).where(drizzleOperators.eq(schema.notifications.organizationId, organizationId))).length, 0);
    const [page] = await db.select().from(schema.uptimeStatusPages).where(drizzleOperators.eq(schema.uptimeStatusPages.id, pageId));
    assert.equal(page.published, true);
    const lock = await pool.connect();
    try {
      await lock.query("BEGIN"); await lock.query("SELECT id FROM uptime_status_pages WHERE id = $1 FOR UPDATE", [pageId]);
      let completed = false;
      const blocked = settings({ subscriptionsEnabled: true }).then((response) => { completed = true; return response; });
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal(completed, false, "toggle uses the same page lock as public signup/confirmation");
      await lock.query("COMMIT"); assert.equal((await blocked).status, 200);
    } finally { await lock.query("ROLLBACK"); lock.release(); }
  });

  let externalSends = 0;
  async function poll(delivery?: () => Promise<void>) {
    const source = await readFile(new URL("../../uptime-probe/src/notifications.ts", import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const module = { exports: {} as { pollUptimeNotifications: (pool: typeof pool) => Promise<void> } };
    runInNewContext(compiled, { Buffer, Date, URL, AbortSignal, process: { env: {} }, console, module, exports: module.exports,
      fetch: async () => { externalSends++; await delivery?.(); return { ok: true }; }, require: (specifier: string) => {
        if (specifier === "node:crypto") return nodeCrypto;
        if (specifier === "./database") return databaseSafety;
        if (specifier === "./config") return { config: { zeptoApiKey: "fake-test-token", statusPublicUrl: "https://status.integration.invalid", unsubscribeSecret: "fake-test-signing-key" } };
        if (specifier === "@outray/incident-content") return { renderIncidentHtml: () => "Approved stored note" };
        if (specifier === "../../../shared/email-sender") return { emailSender: () => ({ address: "no-reply@integration.invalid", name: "Status" }) };
        if (specifier === "../../../shared/email-template") return emailDesign;
        return {};
      } });
    await module.exports.pollUptimeNotifications(pool);
  }
  async function queue(name: string) {
    const notificationId = id(name);
    await db.insert(schema.notifications).values({ id: notificationId, organizationId, incidentId, sourceType: "uptime_incident_update",
      sourceId: updateId, event: "published", channel: "email", recipient: "confirmed@example.test", idempotencyKey: notificationId,
      payload: { pageId, pageSlug: `subscribers-${suffix}`, incidentId, updateId, subscriberId,
        title: "Approved public title", note: "Approved stored note", status: "investigating" } });
    return notificationId;
  }
  const readNotification = async (notificationId: string) => (await db.select().from(schema.notifications).where(drizzleOperators.eq(schema.notifications.id, notificationId)))[0];

  await t.test("real worker pauses queued mail while off, resumes only with consent, and performs no external delivery", async () => {
    const notificationId = await queue("queued");
    await settings({ subscriptionsEnabled: false }); await poll();
    let notification = await readNotification(notificationId);
    assert.equal(externalSends, 0); assert.equal(notification.status, "pending");
    assert.equal(notification.lastError, "subscriptions_disabled"); assert.equal(notification.attempts, 0);
    await settings({ subscriptionsEnabled: true });
    await db.update(schema.notifications).set({ nextAttemptAt: old }).where(drizzleOperators.eq(schema.notifications.id, notificationId));
    await poll(); notification = await readNotification(notificationId);
    assert.equal(externalSends, 1, "the mocked provider is invoked only after re-enabling");
    assert.equal(notification.status, "sent"); assert.equal(notification.attempts, 1);
  });

  await t.test("off switch and unsubscribe wait for an already in-flight delivery before returning", async () => {
    await db.update(schema.uptimeSubscribers).set({ lastSentAt: null }).where(drizzleOperators.eq(schema.uptimeSubscribers.id, subscriberId));
    const notificationId = await queue("in-flight");
    let began!: () => void, release!: () => void;
    const begun = new Promise<void>((resolve) => { began = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    const delivery = poll(async () => { began(); await released; });
    await begun;
    let paused = false, unsubscribed = false;
    const pause = settings({ subscriptionsEnabled: false }).then((response) => { paused = true; return response; });
    const unsubscribe = remove({ status: "unsubscribed" }).then((response) => { unsubscribed = true; return response; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal(paused, false); assert.equal(unsubscribed, false);
    } finally { release(); }
    await delivery;
    assert.equal((await pause).status, 200); assert.equal((await unsubscribe).status, 200);
    assert.equal((await readNotification(notificationId)).status, "sent");
    assert.equal((await readSubscriber()).status, "unsubscribed");
    assert.equal((await (await list()).json()).subscriptionsEnabled, false);
  });

  await t.test("administrative unsubscribe is tenant scoped, idempotent, invalidates pending tokens and is rechecked for already-queued mail", async () => {
    assert.equal((await remove({ status: "unsubscribed" }, "", id("foreign"))).status, 404);
    for (const body of [{ status: "confirmed" }, { status: "pending" }, { status: "unsubscribed", email: "other@example.test" }, {}]) assert.equal((await remove(body)).status, 400);
    const notificationId = await queue("after-consent-removal");
    assert.equal((await remove({ status: "unsubscribed" })).status, 200);
    const first = await readSubscriber();
    assert.equal(first.status, "unsubscribed"); assert.equal(first.confirmedAt?.getTime(), old.getTime());
    assert.equal((await remove({ status: "unsubscribed" })).status, 200);
    assert.equal((await readSubscriber()).unsubscribedAt?.getTime(), first.unsubscribedAt?.getTime());
    assert.equal((await remove({ status: "unsubscribed" }, "", pendingId)).status, 200);
    const pending = await readSubscriber(pendingId);
    assert.equal(pending.tokenHash, null); assert.equal(pending.tokenExpiresAt, null);
    await poll();
    const notification = await readNotification(notificationId);
    assert.equal(notification.status, "suppressed"); assert.equal(notification.lastError, "subscriber_inactive");
    assert.equal(externalSends, 2, "unsubscribe blocks the queued email even while the page is paused");
  });
});
