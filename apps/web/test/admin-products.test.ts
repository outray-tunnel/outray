import assert from "node:assert/strict";
import test from "node:test";
import { adminProductPages } from "../src/lib/admin-products";
import { adminProducts, type AdminProduct } from "../src/lib/admin-usage";
import { AdminProductInputError, adminProductResourceSql, adminProductStatsSql, adminProductTrendSql, loadAdminProduct, parseAdminProductParams } from "../src/lib/admin-products.server";
import type { AdminUsageDatabase } from "../src/lib/admin-usage.server";
import { loadRouteHandlers } from "./helpers/load-route";

const now = new Date("2026-10-17T14:30:00Z");
const statsKeys: Record<AdminProduct, string[]> = {
  tunnels: ["domains", "active_domains", "pending_domains", "failed_domains", "subdomains", "tunnels", "seen_tunnels", "http_tunnels", "tcp_tunnels", "udp_tunnels"],
  observability: ["month_bytes", "previous_bytes", "receiving_workspaces", "enabled_alerts", "firing_alerts", "evaluation_success", "evaluation_no_data", "evaluation_errors", "healthy", "firing", "pending", "no_data", "error", "paused", "muted"],
  secrets: ["vaults", "secrets", "production_envs", "other_envs", "machine_tokens", "operations", "denied", "active_shares", "expired_shares", "exhausted_shares", "revoked_shares"],
  uptime: ["monitors", "up", "down", "unknown", "paused", "overdue", "published_pages", "confirmed_subscribers", "open_incidents", "detected", "published_incidents", "ignored"],
  agent: ["runs", "complete", "failed", "cancelled", "running", "input_tokens", "output_tokens", "completion_rate", "mean_duration"],
};

function harness(product: AdminProduct, view = adminProductPages[product].views[0].id) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let releases = 0;
  let connections = 0;
  let fail = "";
  const stats: Record<string, unknown> = Object.fromEntries(statsKeys[product].map(key => [key, "0"]));
  if (product === "agent") { stats.completion_rate = null; stats.mean_duration = null; }
  const resources: Record<string, unknown> = { total: "0", page: "1", rows: [] };
  const database: AdminUsageDatabase = { async connect() {
    connections += 1;
    return { async query(sql, params) {
      calls.push({ sql, params });
      if (sql === fail) throw new Error("Private database connection failure");
      if (sql === adminProductStatsSql(product)) return { rows: [stats] };
      if (sql === adminProductTrendSql(product)) return { rows: [] };
      if (sql === adminProductResourceSql(product, view)) return { rows: [resources] };
      return { rows: [] };
    }, release() { releases += 1; } };
  } };
  return { database, calls, stats, resources, releases: () => releases, connections: () => connections, failAt(sql: string) { fail = sql; } };
}

test("admin products validate product-specific views, statuses and bounded query input", () => {
  for (const product of adminProducts) {
    for (const view of adminProductPages[product].views) {
      assert.equal(parseAdminProductParams(product, new URLSearchParams({ view: view.id })).params.view, view.id);
    }
  }
  const valid = parseAdminProductParams("uptime", new URLSearchParams("view=monitors&status=unknown&range=90d&page=100000&search=+Acme+"));
  assert.deepEqual(valid.params, { view: "monitors", status: "unknown", range: "90d", page: 100000, search: "Acme" });
  for (const [product, query] of [
    ["billing", ""], ["uptime", "view=vaults"], ["uptime", "status=healthy"], ["uptime", "range=all"],
    ["uptime", "page=0"], ["uptime", "page=100001"], ["uptime", "page=1.5"], ["uptime", "page=1&page=2"],
    ["uptime", "search=%00"], ["uptime", `search=${"x".repeat(151)}`], ["tunnels", "view=subdomains&status=active"],
  ]) assert.throws(() => parseAdminProductParams(product, new URLSearchParams(query)), AdminProductInputError);
});

test("all twelve product views produce complete zero snapshots and exact daily UTC ranges", async () => {
  let tested = 0;
  for (const product of adminProducts) {
    for (const view of adminProductPages[product].views) {
      const h = harness(product, view.id);
      const report = await loadAdminProduct(product, { view: view.id, range: "90d", page: 100000 }, { database: h.database, now });
      assert.equal(report.product, product);
      assert.equal(report.resources.view, view.id);
      assert.deepEqual(report.resources.pagination, { page: 1, pageSize: 25, total: 0, totalPages: 0 });
      assert.equal(report.trend.interval, "day");
      assert.equal(report.trend.points.length, 90);
      assert.equal(report.trend.points[0].date, "2026-07-20");
      assert.equal(report.trend.points.at(-1)?.date, "2026-10-17");
      assert.ok(report.metrics.length >= 5);
      assert.ok(report.metrics.every(metric => metric.value === 0 || metric.value === null));
      assert.ok(report.trend.points.every(point => Object.values(point.values).every(value => value === 0)));
      assert.equal(h.releases(), 1);
      tested += 1;
    }
  }
  assert.equal(tested, 12);
});

test("product snapshots authorize data access through bounded read-only SQL and literal query parameters", async () => {
  const h = harness("uptime", "monitors");
  const search = "a'); SELECT private_data; --";
  await loadAdminProduct("uptime", { view: "monitors", range: "7d", search, status: "unknown", page: 12 }, { database: h.database, now });
  assert.deepEqual(h.calls.slice(0, 3).map(call => call.sql), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SET LOCAL statement_timeout = '10s'", "SET LOCAL TIME ZONE 'UTC'"]);
  assert.equal(h.calls.length, 7);
  const common = ["2026-10-11T00:00:00.000Z", now.toISOString(), "2026-10-01", "2026-09-01"];
  assert.deepEqual(h.calls[3].params, common, "Summary does not inherit table filters");
  assert.deepEqual(h.calls[4].params, common, "Trend does not inherit table filters");
  assert.deepEqual(h.calls[5].params, [...common, search, "unknown", 12, 25]);
  assert.equal(h.calls[5].sql.includes(search), false);
  assert.equal(h.calls.at(-1)?.sql, "COMMIT");
});

test("agent operational rows normalize precise counters, terminal durations and dates without leaking extra fields", async () => {
  const h = harness("agent", "runs");
  h.stats.runs = "1";
  h.stats.complete = "1";
  h.stats.completion_rate = "100.000000";
  h.stats.mean_duration = "123.25";
  h.resources.total = "1";
  h.resources.rows = [{ id: "run-id", name: "Run abc123", organization_id: "org-id", organization_name: "Acme", organization_slug: "acme", prompt: "Must never escape the service", values: { status: "complete", tokens: "4294967298", duration: "123.25", started: "2026-10-17T13:00:00+00:00", raw_error: "Private" }, details: { input_tokens: "2147483649", output_tokens: "2147483649", updated: "2026-10-17T13:00:01Z", completed: "2026-10-17T13:00:01Z", prompt: "Private" } }];
  const report = await loadAdminProduct("agent", { view: "runs" }, { database: h.database, now });
  assert.deepEqual(report.resources.rows[0].values, { status: "complete", tokens: 4294967298, duration: 123.25, started: "2026-10-17T13:00:00.000Z" });
  assert.equal(report.metrics.find(metric => metric.key === "mean_duration")?.value, 123.25);
  assert.equal(report.metrics.find(metric => metric.key === "completion_rate")?.value, 100);
  assert.equal(JSON.stringify(report).includes("Must never escape"), false);
  assert.equal(JSON.stringify(report).includes('"raw_error"'), false);
  assert.equal(report.resources.rows[0].details?.length, 4);
});

test("bad input never connects and failed or unsafe aggregates roll back and release", async () => {
  const invalid = harness("secrets");
  await assert.rejects(loadAdminProduct("secrets", { view: "passwords" }, { database: invalid.database, now }), AdminProductInputError);
  assert.equal(invalid.connections(), 0);
  const failed = harness("secrets");
  failed.failAt(adminProductTrendSql("secrets"));
  await assert.rejects(loadAdminProduct("secrets", {}, { database: failed.database, now }), /Private database/);
  assert.equal(failed.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(failed.releases(), 1);
  for (const unsafe of ["9007199254740993", "NaN", "Infinity", "-1"]) {
    const h = harness("agent");
    h.stats.input_tokens = unsafe;
    await assert.rejects(loadAdminProduct("agent", {}, { database: h.database, now }), /aggregate/);
    assert.equal(h.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(h.releases(), 1);
  }
});

type Handlers = { GET(input: { request: Request; params: { product: string } }): Promise<Response> };
function adminJson(data: unknown, init?: ResponseInit) { return Response.json(data, { ...init, headers: { "Cache-Control": "private, no-store" } }); }
async function routeHarness(denied: Response | null = null, failure?: Error) {
  const calls = { auth: 0, parse: 0, cache: 0, load: 0 };
  const handlers = await loadRouteHandlers<Handlers>({ path: new URL("../src/routes/api/admin/products.$product.ts", import.meta.url), logger: { log() {}, warn() {}, error() {} }, modules: {
    "../../../lib/admin-access.server": { adminJson, async requireAdminAccess() { calls.auth += 1; return denied; } },
    "../../../lib/admin-products.server": { AdminProductInputError, parseAdminProductParams(product: string, query: URLSearchParams) { calls.parse += 1; return parseAdminProductParams(product, query); }, async loadAdminProduct() { calls.load += 1; if (failure) throw failure; return { product: "uptime" }; } },
    "../../../lib/dashboard-cache": { async cachedDashboardRead(_key: string, read: () => Promise<unknown>) { calls.cache += 1; return read(); } },
  } });
  return { ...handlers, calls };
}

test("product API denies before parsing product/query or accessing caches and reports", async () => {
  for (const status of [401, 403]) {
    const denied = adminJson({ error: "Denied" }, { status });
    const h = await routeHarness(denied);
    assert.equal(await h.GET({ request: new Request("https://outray.co/api/admin/products/invalid?range=all"), params: { product: "invalid" } }), denied);
    assert.deepEqual(h.calls, { auth: 1, parse: 0, cache: 0, load: 0 });
  }
});

test("product API returns private invalid-input and generic server errors without internal detail", async () => {
  for (const [product, query, status] of [["invalid", "", 404], ["uptime", "range=all", 400]] as const) {
    const h = await routeHarness();
    const response = await h.GET({ request: new Request(`https://outray.co/api/admin/products/${product}?${query}`), params: { product } });
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(h.calls.load, 0);
  }
  const h = await routeHarness(null, new Error("secret database connection credentials"));
  const response = await h.GET({ request: new Request("https://outray.co/api/admin/products/uptime"), params: { product: "uptime" } });
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.text()).includes("credentials"), false);
  assert.deepEqual(h.calls, { auth: 1, parse: 1, cache: 1, load: 1 });
});
