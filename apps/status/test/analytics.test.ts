import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as crypto from "node:crypto";
import * as net from "node:net";
import ts from "typescript";
import plans from "../../../shared/hosted-plan-limits";
import instance from "../../../shared/instance-config";
import { analyticsEventInput, allowAnalyticsEvent, shouldTrack, visitorHash } from "../src/lib/analytics";
import { readAnalyticsBody } from "../src/lib/analytics-body";

const eventId = "8d679e8e-a522-4bc4-a176-d5d86bbcab38";
const input = { eventId, path: "/", referrer: "https://example.com/private?token=not-for-storage" };
function load<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module, exports: module.exports, Date, Map, URL, Request, Response, AbortSignal, Uint8Array, TextDecoder,
    console: { warn() {}, error() {} }, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, ...globals });
  return module.exports as T;
}

test("analytics input retains only public status paths and referrer hostnames", () => {
  assert.deepEqual(analyticsEventInput(input, "acme"), { eventId, path: "/", referrer: "example.com" });
  assert.equal(analyticsEventInput({ ...input, path: `/acme/incidents/${eventId}` }, "acme")?.path, `/incidents/${eventId}`);
  for (const path of ["/health", "/api/subscribe", "/unsubscribe?token=secret", "/?token=secret", "/other-page", "/incidents/invalid", "/acme/../"]) {
    assert.equal(analyticsEventInput({ ...input, path }, "acme"), null);
  }
  assert.equal(analyticsEventInput({ ...input, eventId: "invalid" }, "acme"), null);
  assert.equal(analyticsEventInput({ ...input, referrer: "javascript:alert(1)" }, "acme")?.referrer, "");
});

test("daily visitor identities are page-scoped, rotate at UTC midnight and contain no raw address", () => {
  const make = (page = "one", day = "2026-10-21", ip = "192.0.2.2") => visitorHash("test-key", page, ip, "Browser", new Date(`${day}T12:00:00Z`));
  assert.match(make(), /^[a-f0-9]{64}$/);
  assert.equal(make(), make());
  assert.notEqual(make(), make("two"));
  assert.notEqual(make(), make("one", "2026-10-22"));
  assert.notEqual(make(), make("one", undefined, "192.0.2.3"));
  assert.equal(visitorHash("", "one", "192.0.2.2", ""), "");
  assert.equal(visitorHash("test", "one", "unknown", ""), "");
});

test("privacy opt-outs, known bots and speculative requests are not tracked", () => {
  assert.equal(shouldTrack(new Request("https://status.example/", { headers: { "user-agent": "Mozilla/5.0" } })), true);
  for (const headers of [{ dnt: "1" }, { "sec-gpc": "1" }, { "user-agent": "Googlebot" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" }]) {
    assert.equal(shouldTrack(new Request("https://status.example/", { headers })), false);
  }
});

test("collector rate limiting resets and caps cardinality", () => {
  for (let i = 0; i < 20; i++) assert.equal(allowAnalyticsEvent("rate-test", 60_000), true);
  assert.equal(allowAnalyticsEvent("rate-test", 60_001), false);
  assert.equal(allowAnalyticsEvent("rate-test", 120_000), true);
  for (let i = 0; i < 10_000; i++) allowAnalyticsEvent(`cardinality-${i}`, 180_000);
  assert.equal(allowAnalyticsEvent("extra-key", 180_000), false);
  assert.equal(allowAnalyticsEvent("extra-key", 240_000), true);
});

test("collection is paid-only, unknown plans fail closed, self-hosted needs no subscription", async () => {
  let plan: string | undefined;
  let selfHosted = false;
  let queries = 0;
  const api = load<typeof import("../src/lib/analytics")>("../src/lib/analytics.ts", {
    "node:crypto": crypto, "node:net": net,
    "../../../../shared/hosted-plan-limits": { default: plans },
    "../../../../shared/instance-config": { default: instance },
    "../../../../shared/status-analytics-outbox": { default: {} },
    "./db": { query: async (sql: string, values: unknown[]) => { queries++; assert.match(sql, /WHERE organization_id = \$1/); assert.deepEqual(Array.from(values), ["org-one"]); return plan ? [{ plan }] : []; } },
    "./config": {}, "./runtime": { statusEnvironment: () => selfHosted ? { OUTRAY_DEPLOYMENT_MODE: "self-hosted", OUTRAY_RETENTION_DAYS: "45" } : {} },
  });
  for (plan of [undefined, "free", "unknown"]) assert.equal(await api.analyticsRetention("org-one"), null);
  for (plan of ["ray", "beam", "pulse", "unlimited"]) assert.ok((await api.analyticsRetention("org-one"))! > 0);
  const before = queries;
  selfHosted = true;
  assert.equal(await api.analyticsRetention("org-one"), 45);
  assert.equal(queries, before);
});

test("ingestion writes only a privacy-safe event and trusts country only from Worker metadata", async () => {
  let worker = false;
  let payload: Record<string, unknown> | undefined;
  const api = load<typeof import("../src/lib/analytics")>("../src/lib/analytics.ts", {
    "node:crypto": crypto, "node:net": net,
    "../../../../shared/hosted-plan-limits": { default: plans }, "../../../../shared/instance-config": { default: instance },
    "./db": { getPool: () => ({ fixture: true }) }, "./config": { getStatusConfig: () => ({ rateLimitSecret: "test-secret" }) },
    "../../../../shared/status-analytics-outbox": { default: {
      admitStatusAnalytics: async (_pool: unknown, event: Record<string, unknown>) => { payload = event; return true; },
      deliverStatusAnalyticsOutbox: async () => 1,
    } },
    "./runtime": { isStatusProduction: () => true, statusEnvironment: () => ({ TINYBIRD_API_HOST: "https://tinybird.example", TINYBIRD_INGEST_TOKEN: "synthetic-append" }),
      getStatusRuntime: () => worker ? { request: { cf: { country: "NG" } } } : undefined },
  }, { fetch: async (url: string, options: RequestInit) => {
    assert.match(url, /\/v0\/events\?name=status_page_views&wait=true$/);
    payload = JSON.parse(String(options.body));
    return Response.json({ successful_rows: 1, quarantined_rows: 0 });
  } });
  const page = { id: "page-one", organization_id: "org-one" };
  const request = new Request("https://status.example/api/analytics", { headers: { "user-agent": "Some browser", "cf-ipcountry": "US" } });
  await api.appendAnalyticsEvent(page, analyticsEventInput(input, "acme")!, request, "192.0.2.2", 14);
  assert.equal(payload?.country, "");
  assert.equal(payload?.retention_days, 14);
  assert.equal(payload?.referrer, "example.com");
  assert.doesNotMatch(JSON.stringify(payload), /192\.0\.2\.2|Some browser|not-for-storage|synthetic-append/);
  worker = true;
  await api.appendAnalyticsEvent(page, analyticsEventInput(input, "acme")!, request, "192.0.2.2", 14);
  assert.equal(payload?.country, "NG");
});

test("public collector resolves host ownership, denies free ingestion and ignores cross-origin/oversized payloads", async () => {
  let paid = false;
  let pagePresent = true;
  let lookups = 0;
  let writes = 0;
  const api = load<{ POST: (context: { request: Request; clientAddress: string }) => Promise<Response> }>("../src/pages/api/analytics.ts", {
    "../../lib/analytics-body": { readAnalyticsBody },
    "../../lib/analytics": { analyticsEventInput, shouldTrack, visitorHash, allowAnalyticsEvent: () => true, analyticsRetention: async () => paid ? 14 : null, appendAnalyticsEvent: async () => { writes++; } },
    "../../lib/config": { getStatusConfig: () => ({ enabled: true, edgeSecret: "test-edge", rateLimitSecret: "test-rate" }) },
    "../../lib/runtime": { isStatusProduction: () => true, getStatusRuntime: () => undefined },
    "../../lib/security": { safeClientIp: () => "192.0.2.2", isSameOrigin: (r: Request) => r.headers.get("origin") === "https://status.example" },
    "../../lib/status-data": { findPageForRequest: async (_r: Request, slug: string | null) => { lookups++; assert.equal(slug, null); return pagePresent ? { id: "page-one", slug: "acme", organization_id: "org-one" } : null; } },
  });
  const collect = (body: unknown = input, origin = "https://status.example", secret = "test-edge") => api.POST({ clientAddress: "192.0.2.2", request: new Request("https://status.example/api/analytics", {
    method: "POST", headers: { origin, "x-outray-edge-secret": secret }, body: JSON.stringify(body),
  }) });
  assert.equal((await collect()).status, 204);
  assert.equal(writes, 0);
  paid = true;
  assert.equal((await collect({ ...input, organizationId: "other-org", slug: "other-page", plan: "unlimited" })).status, 204);
  assert.equal(writes, 1);
  pagePresent = false;
  await collect(); assert.equal(writes, 1);
  const before = lookups;
  await collect(input, "https://evil.example");
  await collect(input, "https://status.example", "wrong");
  await collect({ ...input, padding: "x".repeat(5000) });
  assert.equal(lookups, before);
  assert.equal(writes, 1);
});
