import assert from "node:assert/strict";
import test from "node:test";
import { loadRouteHandlers } from "./helpers/load-route";
import { parseUsageAggregateParams, UsageAggregateInputError } from "../src/lib/product-usage-report.server";

test("permanent usage filters are bounded and unambiguous", () => {
  assert.deepEqual(parseUsageAggregateParams(new URLSearchParams("product=secrets&range=all&organizationId=acme")), { product: "secrets", range: "all", organizationId: "acme" });
  for (const query of ["range=1y", "range=30d&range=7d", "product=sql", "organizationId=%00", `organizationId=${"x".repeat(129)}`]) assert.throws(() => parseUsageAggregateParams(new URLSearchParams(query)), UsageAggregateInputError);
});

type Handlers = { GET(input: { request: Request }): Promise<Response> };
async function route(denied: Response | null = null) {
  const calls: string[] = [];
  const keys: unknown[] = [];
  const handlers = await loadRouteHandlers<Handlers>({ path: new URL("../src/routes/api/admin/usage/aggregates.ts", import.meta.url), modules: {
    "@/db": { pool: {} },
    "@/lib/admin-access.server": { async requireAdminAccess() { calls.push("auth"); return denied; }, adminJson: (data: unknown, init?: ResponseInit) => Response.json(data, { ...init, headers: { "Cache-Control": "private, no-store" } }) },
    "@/lib/dashboard-cache": { dashboardCacheKey(_name: string, params: unknown) { keys.push(params); return "key"; }, async cachedDashboardRead(_key: string, read: () => Promise<unknown>) { calls.push("cache"); return read(); } },
    "@/lib/product-usage-report.server": { parseUsageAggregateParams, UsageAggregateInputError, async loadUsageAggregates(_pool: unknown, params: unknown) { calls.push("database"); return { params, metrics: [{ lifetime: "9007199254740993" }] }; } },
    "@/lib/redis": { redis: { async xlen() { return 0; }, async xrange() { return []; } } },
  } });
  return { ...handlers, calls, keys };
}

test("admin-only aggregate API rejects before cache or database reads", async () => {
  for (const status of [401, 403]) {
    const denied = new Response(null, { status }), h = await route(denied);
    assert.equal(await h.GET({ request: new Request("https://outray.co/api/admin/usage/aggregates?range=invalid") }), denied);
    assert.deepEqual(h.calls, ["auth"]);
    assert.equal(h.keys.length, 0);
  }
});

test("aggregate API returns exact strings, isolates filter cache keys and rejects invalid input", async () => {
  const h = await route();
  const response = await h.GET({ request: new Request("https://outray.co/api/admin/usage/aggregates?organizationId=acme&product=agent&range=365d") });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const data = await response.json();
  assert.equal(data.metrics[0].lifetime, "9007199254740993");
  assert.deepEqual(data.params, { organizationId: "acme", product: "agent", range: "365d" });
  assert.equal((h.keys[0] as { organizationId: string }).organizationId, "acme");
  const invalid = await route();
  assert.equal((await invalid.GET({ request: new Request("https://outray.co/api/admin/usage/aggregates?range=invalid") })).status, 400);
  assert.deepEqual(invalid.calls, ["auth"]);
});
