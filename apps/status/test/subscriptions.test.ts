import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

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

const page = { id: "page-one", organization_id: "org-one", name: "Acme status", slug: "acme", subscriptions_enabled: true, published: true };
const subscriber = { id: "subscriber-one", page_id: page.id, organization_id: page.organization_id, email: "person@example.test", status: "pending", name: page.name, slug: page.slug };
const token = "a".repeat(43);
const config = { enabled: true, zeptoApiKey: "fake-test-key", fromEmail: "no-reply@example.test", publicUrl: new URL("https://status.example.test/") };

function subscriptionFixture(options: { enabled?: boolean; lockedEnabled?: boolean; shareEnabled?: boolean; published?: boolean; ipCount?: number; mailFailure?: boolean } = {}) {
  const statements: string[] = [];
  let mailCount = 0;
  let released = false;
  const execute = async (sql: string) => {
    statements.push(sql);
    if (sql.includes("FROM uptime_status_pages") && /FOR UPDATE|FOR SHARE/.test(sql)) {
      assert.match(sql, /SELECT published, subscriptions_enabled/);
      return { rows: [{ published: options.published !== false, subscriptions_enabled: sql.includes("FOR SHARE") ? options.shareEnabled !== false : options.lockedEnabled !== false }], rowCount: 1 };
    }
    if (sql.includes("JOIN uptime_status_pages")) {
      if (sql.includes("s.status = 'pending'")) assert.match(sql, /p\.subscriptions_enabled = true/);
      return { rows: [subscriber], rowCount: 1 };
    }
    if (sql.includes("confirmed_count")) return { rows: [{ confirmed_count: "0", pending_count: "0" }], rowCount: 1 };
    if (sql.includes("ip_count")) return { rows: [{ ip_count: String(options.ipCount || 0), email_count: "0" }], rowCount: 1 };
    if (sql.includes("SELECT id, status")) return { rows: [], rowCount: 0 };
    if (sql.includes("COUNT(*)::text AS count")) return { rows: [{ count: "0" }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  };
  const api = loadModule<{
    requestSubscription: (pageId: string, email: string, ip: string) => Promise<string>;
    inspectConfirmation: (token: string) => Promise<unknown>;
    confirmSubscription: (token: string) => Promise<unknown>;
    unsubscribe: (token: string) => Promise<unknown>;
  }>("../src/lib/subscriptions.ts", {
    "node:crypto": { randomUUID: () => "random-id" },
    "./config": { getStatusConfig: () => config },
    "./db": { getPool: () => ({ connect: async () => ({ query: execute, release: () => { released = true; } }) }), query: async (sql: string) => (await execute(sql)).rows },
    "./status-data": { findPublishedPageById: async () => ({ ...page, subscriptions_enabled: options.enabled !== false }) },
    "./runtime": { statusEnvironment: () => ({}) },
    "./security": {
      normalizeEmail: (email: string) => email.trim().toLowerCase(),
      hashRateKey: (kind: string, value: string) => `${kind}:${value}`,
      newToken: () => token, tokenHash: (value: string) => `hash:${value}`,
      verifyUnsubscribeToken: () => ({ subscriberId: subscriber.id, pageId: page.id }),
    },
  }, { fetch: async () => { mailCount++; return new Response("{}", { status: options.mailFailure ? 503 : 200 }); } });
  return { api, statements, mailCount: () => mailCount, released: () => released };
}

test("paused public subscriptions do not connect, rewrite consent, or send confirmation mail", async () => {
  const fixture = subscriptionFixture({ enabled: false });
  assert.equal(await fixture.api.requestSubscription(page.id, subscriber.email, "127.0.0.1"), "disabled");
  assert.deepEqual(fixture.statements, []);
  assert.equal(fixture.mailCount(), 0);
});

test("signup rechecks pause and publication under the page lock before writing", async () => {
  for (const options of [{ lockedEnabled: false }, { published: false }]) {
    const fixture = subscriptionFixture(options);
    assert.equal(await fixture.api.requestSubscription(page.id, subscriber.email, "127.0.0.1"), "disabled");
    assert.match(fixture.statements[1], /FOR UPDATE/);
    assert.equal(fixture.statements[2], "COMMIT");
    assert.equal(fixture.statements.length, 3);
    assert.equal(fixture.mailCount(), 0);
    assert.equal(fixture.released(), true);
  }
});

test("enabled signup retains rate limiting and double opt-in", async () => {
  const allowed = subscriptionFixture();
  assert.equal(await allowed.api.requestSubscription(page.id, subscriber.email, "127.0.0.1"), "sent");
  assert.match(allowed.statements.join("\n"), /'pending'.*\$5/s);
  assert.equal(allowed.mailCount(), 1);
  const limited = subscriptionFixture({ ipCount: 5 });
  assert.equal(await limited.api.requestSubscription(page.id, subscriber.email, "127.0.0.1"), "rate-limited");
  assert.equal(limited.mailCount(), 0);
  assert.equal(limited.statements.some((sql) => sql.includes("INSERT INTO uptime_subscribers")), false);
});

test("confirmation send rechecks pause under a shared page lock after consent is committed", async () => {
  const paused = subscriptionFixture({ shareEnabled: false });
  assert.equal(await paused.api.requestSubscription(page.id, subscriber.email, "127.0.0.1"), "disabled");
  assert.equal(paused.mailCount(), 0);
  const insertIndex = paused.statements.findIndex((sql) => sql.includes("INSERT INTO uptime_subscribers"));
  const shareIndex = paused.statements.findIndex((sql) => sql.includes("FOR SHARE"));
  assert.ok(insertIndex > 0);
  assert.ok(shareIndex > insertIndex);
  assert.ok(paused.statements.slice(insertIndex + 1, shareIndex).includes("COMMIT"));
  assert.equal(paused.statements.at(-1), "COMMIT");
});

test("confirmation provider failure rolls back only the send lock, preserving prior consent and rate attempts", async () => {
  const fixture = subscriptionFixture({ mailFailure: true });
  await assert.rejects(fixture.api.requestSubscription(page.id, subscriber.email, "127.0.0.1"), /Confirmation email delivery failed/);
  assert.equal(fixture.mailCount(), 1);
  const shareIndex = fixture.statements.findIndex((sql) => sql.includes("FOR SHARE"));
  assert.ok(fixture.statements.slice(0, shareIndex).includes("COMMIT"));
  assert.equal(fixture.statements.at(-1), "ROLLBACK");
});

test("pending confirmations recheck pause under lock before consent changes", async () => {
  const fixture = subscriptionFixture({ lockedEnabled: false });
  assert.equal(await fixture.api.confirmSubscription(token), null);
  assert.match(fixture.statements[1], /p\.subscriptions_enabled = true/);
  assert.match(fixture.statements[2], /FOR UPDATE/);
  assert.equal(fixture.statements[3], "ROLLBACK");
  assert.equal(fixture.statements.some((sql) => sql.startsWith("UPDATE")), false);
  assert.equal(fixture.released(), true);
});

test("confirmation inspection is gated but signed unsubscribe stays available while paused", async () => {
  const fixture = subscriptionFixture({ enabled: false });
  await fixture.api.inspectConfirmation(token);
  assert.match(fixture.statements[0], /p\.subscriptions_enabled = true/);
  fixture.statements.length = 0;
  await fixture.api.unsubscribe("signed-token");
  assert.doesNotMatch(fixture.statements.join("\n"), /subscriptions_enabled/);
  assert.match(fixture.statements[1], /status = 'unsubscribed'/);
});

function routeFixture(options: { enabled?: boolean; result?: string; origin?: boolean; failure?: string; production?: boolean } = {}) {
  let requests = 0;
  const route = loadModule<{ POST: (context: { request: Request; clientAddress?: string }) => Promise<Response> }>("../src/pages/api/subscribe.ts", {
    "../../lib/config": { getStatusConfig: () => config, statusPageUrl: () => new URL("https://acme.status.example.test/") },
    "../../lib/subscriptions": { requestSubscription: async () => { requests++; if (options.failure) throw new Error(options.failure); return options.result || "sent"; } },
    "../../lib/security": { isSameOrigin: () => options.origin !== false, safeClientIp: () => "127.0.0.1" },
    "../../lib/status-data": { findPublishedPageById: async () => ({ ...page, subscriptions_enabled: options.enabled !== false }), findPageForRequest: async () => page },
    "../../lib/runtime": { getStatusRuntime: () => undefined, isStatusProduction: () => options.production === true },
  }, {
    process: { env: { NODE_ENV: options.production ? "production" : "development" } },
    console: { error() {} },
  });
  return { route, requests: () => requests };
}

function signupRequest(json = true) {
  const body = new FormData();
  body.set("pageId", page.id);
  body.set("email", subscriber.email);
  return new Request("http://localhost:4323/api/subscribe", { method: "POST", headers: json ? { Accept: "application/json" } : {}, body });
}

test("AJAX signup gives neutral inline success for new, existing, full, and rate-limited addresses", async () => {
  for (const result of ["sent", "already-confirmed", "full", "rate-limited"]) {
    const fixture = routeFixture({ result });
    const response = await fixture.route.POST({ request: signupRequest() });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  const unavailable = routeFixture({ failure: "Confirmation email delivery failed (503)" });
  assert.deepEqual(await (await unavailable.route.POST({ request: signupRequest() })).json(), { ok: true });
});

test("AJAX signup reports known validation and pause errors without submitting a paused page", async () => {
  for (const options of [{ enabled: false }, { result: "disabled" }]) {
    const fixture = routeFixture(options);
    const response = await fixture.route.POST({ request: signupRequest() });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "Subscriptions are currently turned off for this status page." });
    assert.equal(fixture.requests(), options.enabled === false ? 0 : 1);
  }
  const invalid = routeFixture({ failure: "Invalid email address" });
  const response = await invalid.route.POST({ request: signupRequest() });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid email address" });
  const crossOrigin = routeFixture({ origin: false });
  assert.equal((await crossOrigin.route.POST({ request: signupRequest() })).status, 403);
  assert.equal(crossOrigin.requests(), 0);
});

test("ordinary form fallback returns to the local renderer, not a deployed status page", async () => {
  const fixture = routeFixture();
  const response = await fixture.route.POST({ request: signupRequest(false) });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost:4323/acme?subscribed=1");
});

test("Get updates submits same-origin JSON responses and propagates inline errors", async () => {
  let request: { url: string; init: RequestInit } | null = null;
  let response = Response.json({ ok: true });
  const client = loadModule<{ submitSubscription: (pageId: string, email: string) => Promise<void> }>("../src/components/subscription-client.ts", {}, {
    fetch: async (url: string, init: RequestInit) => { request = { url, init }; return response; },
  });
  await client.submitSubscription(page.id, subscriber.email);
  assert.equal(request!.url, "/api/subscribe");
  assert.equal(request!.init.credentials, "same-origin");
  assert.equal((request!.init.headers as Record<string, string>).Accept, "application/json");
  assert.equal((request!.init.body as FormData).get("pageId"), page.id);
  response = Response.json({ error: "Subscriptions are currently turned off." }, { status: 409 });
  await assert.rejects(client.submitSubscription(page.id, subscriber.email), /Subscriptions are currently turned off/);
  response = new Response("<html>Unexpected response</html>");
  await assert.rejects(client.submitSubscription(page.id, subscriber.email), /Please try again/);
});

test("public subscription control uses a gated Motion modal with accessible input and native focus trapping", () => {
  const astro = readFileSync(new URL("../src/components/StatusPage.astro", import.meta.url), "utf8");
  const component = readFileSync(new URL("../src/components/GetUpdates.tsx", import.meta.url), "utf8");
  assert.match(astro, /page\.subscriptionsEnabled && Boolean/);
  assert.match(astro, /subscriptionsEnabled && <GetUpdates/);
  assert.doesNotMatch(astro, /id="open-subscribe"|subscribe-dialog/);
  assert.match(component, /from "motion\/react"/);
  assert.match(component, /dialog\.showModal\(\)/);
  assert.match(component, /items-center justify-center/);
  assert.match(component, /onCancel=.*event\.preventDefault\(\).*requestClose\(\)/);
  assert.match(component, /onExitComplete=\{finishClose\}/);
  assert.match(component, /triggerRef\.current\?\.focus/);
  assert.match(component, /htmlFor=\{`\$\{ids\}-email`\}/);
  assert.match(component, /type="email".*required disabled=\{sending\}/s);
  assert.match(component, /border-0 bg-transparent.*hover:bg-\[#27272a\]/);
  assert.match(component, /role="status"/);
  assert.match(component, /role="alert"/);
  assert.doesNotMatch(component, /animate-in|animate-out|@keyframes/);
  const config = readFileSync(new URL("../astro.config.mjs", import.meta.url), "utf8");
  assert.match(config, /dedupe: \["react", "react-dom"\]/);
  assert.match(config, /noExternal: \["motion", "framer-motion", "motion-dom", "motion-utils"\]/);
});
