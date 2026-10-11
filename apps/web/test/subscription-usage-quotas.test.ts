import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadRouteHandlers } from "./helpers/load-route";

const { getBandwidthKey } = createRequire(import.meta.url)("../../../shared/helpers.ts") as { getBandwidthKey: (id: string, now?: Date) => string };

async function harness(options: { denied?: boolean; fail?: boolean; selfHosted?: boolean } = {}) {
  const calls: string[] = [], sqlValues: unknown[] = [], caches: string[] = [];
  const { GET } = await loadRouteHandlers<{ GET: (args: { request: Request; params: { orgSlug: string } }) => Promise<Response> }>({
    path: new URL("../src/routes/api/$orgSlug/subscriptions.ts", import.meta.url),
    logger: { log() {}, warn() {}, error() {} },
    modules: {
      "drizzle-orm": { eq: () => ({}), sql: (parts: TemplateStringsArray, ...values: unknown[]) => {
        sqlValues.push(...values); calls.push(parts.join("?")); return {};
      } },
      "../../../db": { db: {
        select() { return { from() { return { where() { return { async limit() { calls.push("subscription"); return [{ organizationId: "url-org", plan: "beam", billingInterval: "year" }]; } }; } }; } }; },
        async execute() { if (options.fail) throw new Error("No quota table"); return { rows: [{ domains: "2", subdomains: "4", members: "3", reserved_member_seats: "1", monitors: "12", alerts: "9", vaults: "6", secrets: "321", status_pages: "1", telemetry_bytes: "1234567" }] }; },
      } },
      "../../../db/subscription-schema": { subscriptions: { organizationId: "organization_id" } },
      "../../../lib/redis": { redis: { async scard(key: string) { assert.equal(key, "org:url-org:online_tunnels"); return 2; }, async get(key: string) { assert.equal(key, getBandwidthKey("url-org")); return "246810"; } } },
      "../../../lib/org": { async requireOrgFromSlug(_request: Request, slug: string) { calls.push("authorize"); assert.equal(slug, "url-workspace"); return options.denied ? { error: Response.json({ error: "Forbidden" }, { status: 403 }) } : { organization: { id: "url-org" } }; } },
      "../../../lib/dashboard-redis-cache": { cachedDashboardRedisRead(key: string, read: () => Promise<unknown>) { caches.push(key); return read(); } },
      "../../../../../../shared/instance-config": { instanceConfig: () => ({ selfHosted: options.selfHosted, limits: { maxTunnels: 7, telemetryBytesPerMonth: 9999 }, retentionDays: 14 }) },
      "../../../../../../shared/utils": { getBandwidthKey },
    },
  });
  return { calls, sqlValues, caches, get: () => GET({ request: new Request("https://console.test/api/url-workspace/subscriptions"), params: { orgSlug: "url-workspace" } }) };
}

test("subscription usage authorizes first and scopes every count/cache to the URL organization", async () => {
  const denied = await harness({ denied: true }); assert.equal((await denied.get()).status, 403);
  assert.deepEqual(denied.calls, ["authorize"]); assert.equal(denied.caches.length, 0);
  const fixture = await harness(); const response = await fixture.get(); assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.usage, { tunnels: 2, domains: 2, subdomains: 4, members: 3, reservedMemberSeats: 1, uptimeMonitors: 12, observabilityAlerts: 9, secretVaults: 6, secretEntries: 321, statusPages: 1, bandwidthBytes: 246810, telemetryBytes: 1234567,
    telemetryMonth: new Date().toISOString().slice(0, 7), telemetryResetsAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString() });
  assert.equal(fixture.calls[0], "authorize");
  assert.equal(fixture.sqlValues.filter(value => value === "url-org").length, 10);
  assert.match(fixture.calls[2], /purpose = 'tunnel'/);
  assert.equal((fixture.calls[2].match(/deleted_at IS NULL/g) ?? []).length, 4);
  assert.match(fixture.caches[1], /^bandwidth-usage:url-org:\d{4}-\d{2}-01$/);
  assert.equal(body.subscription.billingInterval, "year");
});

test("failed usage is not presented as a zero allowance or partial success", async () => {
  const fixture = await harness({ fail: true }); const response = await fixture.get();
  assert.equal(response.status, 500); assert.equal((await response.json()).usage, undefined);
});

test("self-hosted usage includes administrator retention and capacity overrides", async () => {
  const fixture = await harness({ selfHosted: true }); const body = await (await fixture.get()).json();
  assert.deepEqual(body.subscription, { plan: "unlimited", status: "active", organizationId: "url-org" });
  assert.equal(body.instanceLimits.retentionDays, 14); assert.equal(body.instanceLimits.telemetryBytesPerMonth, 9999);
});

test("tunnel bandwidth uses UTC calendar boundaries regardless of the server's time zone", () => {
  assert.equal(getBandwidthKey("org", new Date("2026-11-01T00:30:00+01:00")), "bw:org:2026-10");
  assert.equal(getBandwidthKey("org", new Date("2026-10-31T20:30:00-04:00")), "bw:org:2026-11");
});
