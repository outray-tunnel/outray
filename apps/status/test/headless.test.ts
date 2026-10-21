import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import policy from "../../../shared/status-headless";
import { analyticsEventInput, shouldTrack, visitorHash } from "../src/lib/analytics";
import { readAnalyticsBody } from "../src/lib/analytics-body";
import type { PublicStatusPage } from "../src/lib/status-data";

const pageId = "acdcc15f-16a4-51cc-a6b9-5f6161706284";
const incidentId = "8d679e8e-a522-4bc4-a176-d5d86bbcab38";
const date = new Date("2026-10-21T12:00:00Z");
function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module, exports: module.exports, Date, Map, URL, Request, Response, AbortSignal, Uint8Array, TextDecoder,
    console: { warn() {} }, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return module.exports as T;
}

function pageFixture(): PublicStatusPage {
  return {
    id: pageId, organizationId: "private-org", slug: "acme", name: "Acme Status", description: null,
    logoUrl: null, accentColor: "#8367c7", canonicalUrl: "https://acme.status.example/", subscriptionsEnabled: true,
    state: "outage", groups: [{ id: "group", sortOrder: 0, name: "Platform", state: "outage", components: [{
      id: "component", sortOrder: 0, name: "API", description: null, state: "outage", manual: false, updatedAt: date,
      observedUptime90d: 99.4, history: [{ date: "2026-10-21", state: "outage", checks: 100, successes: 99,
        reportedMonitors: 1, expectedMonitors: 1, detectedFailureMinutes: 1, incidentMinutes: 1,
        incidentKind: "downtime", incidents: [{ id: incidentId, title: "API incident", minutes: 1, automatic: true }] }],
    }] }], standaloneComponents: [], incidents: [{ id: incidentId, title: "API incident", sourceType: "uptime_monitor",
      status: "open", startedAt: date, resolvedAt: null, components: ["API"], latestNote: "Investigating", latestNoteAt: date,
      updates: [{ id: "update", note: "Investigating", body: null, status: "investigating", publishedAt: date }] }],
  };
}

test("origins are exact, bounded, canonical and secure; URLs use the configured status origin", () => {
  assert.deepEqual(policy.normalizeAnalyticsOrigins(["https://EXAMPLE.com/", "https://example.com"]), ["https://example.com"]);
  assert.deepEqual(policy.normalizeAnalyticsOrigins([]), []);
  for (const entry of ["http://example.com", "http://localhost:3000", "https://*.example.com", "https://user:pass@example.com", "https://example.com/status", "https://example.com/?token=secret", "https://example.com/#hash", "null"]) {
    assert.equal(policy.normalizeAnalyticsOrigins([entry]), null, entry);
  }
  assert.equal(policy.normalizeAnalyticsOrigins(Array(11).fill("https://example.com")), null);
  assert.deepEqual(policy.normalizeAnalyticsOrigins(["http://localhost:3000"], true), ["http://localhost:3000"]);
  assert.equal(policy.normalizeAnalyticsOrigins(["http://example.com"], true), null);
  assert.equal(policy.headlessStatusUrls("https://status.selfhost.example", pageId).page, `https://status.selfhost.example/api/v1/pages/${pageId}`);
});

test("public JSON uses the hosted loader and whitelists ISO-serialized public fields, including outages", async () => {
  const fixture = pageFixture();
  Object.assign(fixture, { subscriberEmails: ["private@example.com"], credentials: "private-key" });
  Object.assign(fixture.groups[0].components[0], { monitorIds: ["private-monitor"], headers: { Authorization: "private-token" } });
  const api = load<typeof import("../src/lib/headless")>("../src/lib/headless.ts", {
    "../../../../shared/status-headless": { default: policy }, "./config": { getStatusConfig: () => ({ enabled: true }) },
    "./status-data": { findPublishedPageById: async (id: string) => { assert.equal(id, pageId); return { id }; },
      loadPublicPage: async () => fixture, publishedIncidentStage: () => "investigating" },
  });
  const response = await api.publicStatusResponse(pageId);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("cache-control"), "public, max-age=15, s-maxage=15");
  assert.equal(response.headers.get("set-cookie"), null);
  const body = await response.json();
  assert.equal(body.state, fixture.state);
  assert.equal(body.groups[0].components[0].updatedAt, date.toISOString());
  assert.equal(body.groups[0].components[0].history[0].state, "outage");
  assert.equal(body.incidents[0].updates[0].publishedAt, date.toISOString());
  assert.equal(body.incidents[0].resolvedAt, null);
  assert.doesNotMatch(JSON.stringify(body), /private-|organizationId|subscriberEmails|monitorIds|credentials|Authorization/);
  assert.equal(api.publicStatusOptions().status, 204);
});

test("missing/unpublished/disabled pages and inaccessible incidents are 404; loader errors are uncached 503", async () => {
  let enabled = true; let present = true; let incidentPresent = true; let fail = false; let lookups = 0;
  const fixture = pageFixture();
  const api = load<typeof import("../src/lib/headless")>("../src/lib/headless.ts", {
    "../../../../shared/status-headless": { default: policy }, "./config": { getStatusConfig: () => ({ enabled }) },
    "./status-data": { findPublishedPageById: async () => { lookups++; return present ? { id: pageId, organization_id: "right-org" } : null; },
      loadPublicPage: async () => { if (fail) throw new Error("private database detail"); return fixture; },
      loadPublicIncident: async (page: { organization_id: string }, id: string) => { assert.equal(page.organization_id, "right-org"); assert.equal(id, incidentId); return incidentPresent ? fixture.incidents[0] : null; },
      publishedIncidentStage: () => "investigating" },
  });
  assert.equal((await api.publicStatusResponse("bad-id")).status, 404);
  enabled = false; assert.equal((await api.publicStatusResponse(pageId)).status, 404); assert.equal(lookups, 0);
  enabled = true; present = false; assert.equal((await api.publicStatusResponse(pageId)).status, 404);
  present = true; incidentPresent = false; assert.equal((await api.publicStatusResponse(pageId, incidentId)).status, 404);
  incidentPresent = true; assert.equal((await api.publicStatusResponse(pageId, incidentId)).status, 200);
  fail = true; const response = await api.publicStatusResponse(pageId);
  assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "status_unavailable" });
});

test("headless collector requires a published page, allowed Origin, trusted ingress, and paid entitlement", async () => {
  let paid = true; let published = true; let limited = false; let lookups = 0;
  const writes: unknown[][] = [];
  const collector = load<typeof import("../src/lib/headless-analytics")>("../src/lib/headless-analytics.ts", {
    "../../../../shared/status-headless": { default: policy },
    "./analytics": { shouldTrack, visitorHash, analyticsEventInput, allowAnalyticsEvent: () => !limited,
      analyticsRetention: async () => paid ? 14 : null, appendAnalyticsEvent: async (...args: unknown[]) => { writes.push(args); } },
    "./analytics-body": { readAnalyticsBody },
    "./config": { getStatusConfig: () => ({ enabled: true, edgeSecret: "edge", rateLimitSecret: "hash-key" }) },
    "./runtime": { isStatusProduction: () => true, getStatusRuntime: () => undefined },
    "./security": { safeClientIp: () => "192.0.2.1" },
    "./status-data": { findPublishedPageById: async () => { lookups++; return published ? { id: pageId, organization_id: "right-org", analytics_origins: ["https://custom.example"] } : null; } },
  });
  const event = { eventId: incidentId, path: "/status", referrer: "https://other.example/private?token=secret", organizationId: "wrong-org" };
  const collect = (origin = "https://custom.example", body: unknown = event, headers: Record<string, string> = {}, method = "POST") => collector.collectHeadlessAnalytics(new Request(`https://status.example/api/v1/pages/${pageId}/analytics`, {
    method, headers: { origin, "x-outray-edge-secret": "edge", ...headers }, ...(method === "OPTIONS" ? {} : { body: JSON.stringify(body) }),
  }), pageId, "192.0.2.1");
  const accepted = await collect();
  assert.equal(accepted.status, 204); assert.equal(accepted.headers.get("access-control-allow-origin"), "https://custom.example");
  assert.equal(accepted.headers.get("vary"), "Origin"); assert.equal(accepted.headers.get("access-control-allow-credentials"), null);
  assert.equal(writes.length, 1);
  assert.equal((writes[0][0] as { organization_id: string }).organization_id, "right-org");
  assert.equal((writes[0][1] as { referrer: string }).referrer, "other.example");
  assert.equal(writes[0][5], "https://custom.example");
  assert.equal((await collect("https://custom.example", event, {}, "OPTIONS")).status, 204);
  assert.equal(writes.length, 1);
  assert.equal((await collect("https://evil.example")).headers.get("access-control-allow-origin"), null);
  await collect("null"); await collect(""); await collect("https://custom.example", event, { "x-outray-edge-secret": "wrong" });
  paid = false; await collect(); paid = true;
  published = false; await collect(); published = true;
  await collect("https://custom.example", event, { "sec-gpc": "1" });
  await collect("https://custom.example", event, { "user-agent": "Googlebot" });
  const before = lookups;
  await collect("https://custom.example", { ...event, padding: "x".repeat(4096) });
  await collect("https://custom.example", { ...event, path: "/status?token=secret" });
  limited = true; await collect();
  assert.equal(lookups, before); assert.equal(writes.length, 1);
});

test("custom paths cannot weaken the hosted collector's narrow path contract", () => {
  const event = { eventId: incidentId, path: "/status", referrer: "" };
  assert.equal(analyticsEventInput(event, "acme"), null);
  assert.equal(analyticsEventInput(event, "", true)?.path, "/status");
  for (const path of ["//evil.example", "/?secret=1", "/#token", "/back\\slash", "/control\n", "/" + "x".repeat(2048)]) {
    assert.equal(analyticsEventInput({ ...event, path }, "", true), null);
  }
});
