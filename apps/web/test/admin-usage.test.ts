import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_USAGE_PAGE_SIZE, AdminUsageInputError, adminUsageDailySql, adminUsageMonthlySql,
  adminUsageSnapshotSql, loadAdminUsage, parseAdminUsageParams, type AdminUsageDatabase,
} from "../src/lib/admin-usage.server";
import { loadRouteHandlers } from "./helpers/load-route";

const now = new Date("2026-10-17T13:25:42.000Z");
function fixture() {
  return {
    summary: { organizations: "3", users: "4", adopted_organizations: "2", multi_product_organizations: "1", product_configurations: "5" },
    totals: {
      tunnels_configured: "1", tunnels_active: "1", tunnels: "2", seen_tunnels: "1", subdomains: "1", domains: "0",
      observability_configured: "1", observability_active: "1", month_bytes: "4096", alerts: "1", enabled_alerts: "1",
      secrets_configured: "1", secrets_active: "1", vaults: "2", environments: "3", secrets: "6", secret_operations: "5",
      uptime_configured: "1", uptime_active: "1", monitors: "2", enabled_monitors: "1", published_pages: "1", uptime_checks: "12", uptime_successes: "10",
      agent_configured: "1", agent_active: "1", agent_runs: "3", agent_tokens: "100", failed_runs: "1", completed_runs: "1",
    },
    total: "28",
    organizations: [{
      id: "org-id", name: "Acme", slug: "acme", plan: "beam", products: ["secrets", "uptime"], last_activity_at: "2026-10-17T13:00:00Z",
      tunnels: "0", alerts: "0", vaults: "2", secrets: "6", monitors: "2", published_pages: "1", month_bytes: "0", secret_operations: "5", uptime_checks: "12", agent_runs: "0", agent_tokens: "0",
    }],
  };
}

function databaseHarness(options: { snapshot?: ReturnType<typeof fixture>; failAt?: string } = {}) {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  let connections = 0;
  let releases = 0;
  const database: AdminUsageDatabase = { async connect() {
    connections += 1;
    return {
      async query(sql, params) {
        calls.push({ sql, params });
        if (sql === options.failAt) throw new Error("Deliberate read failure");
        if (sql === adminUsageSnapshotSql) return { rows: [options.snapshot ?? fixture()] };
        if (sql === adminUsageDailySql) return { rows: [{ date: "2026-10-17", secret_operations: "5", uptime_checks: "12", agent_runs: "3", agent_tokens: "100", tunnels_created: "2" }] };
        if (sql === adminUsageMonthlySql) return { rows: [{ month: "2026-10", bytes: "4096", organizations: "1" }] };
        return { rows: [] };
      },
      release() { releases += 1; },
    };
  } };
  return { database, calls, connections: () => connections, releases: () => releases };
}

test("usage parameters normalize defaults and reject unbounded or ambiguous input", () => {
  assert.deepEqual(parseAdminUsageParams(new URLSearchParams()), { range: "30d", page: 1, search: undefined, product: undefined, organizationId: undefined });
  assert.deepEqual(parseAdminUsageParams(new URLSearchParams("range=7d&page=2&search=+Acme+&product=secrets&organizationId=org-id")), {
    range: "7d", page: 2, search: "Acme", product: "secrets", organizationId: "org-id",
  });
  for (const query of ["range=1y", "range=7d&range=90d", "page=0", "page=-1", "page=1.2", "page=1e3", "page=1000000", "product=billing", "search=%00", `search=${"x".repeat(151)}`, `organizationId=${"x".repeat(129)}`]) {
    assert.throws(() => parseAdminUsageParams(new URLSearchParams(query)), AdminUsageInputError, query);
  }
});

test("usage uses a bounded read-only snapshot and parameterized filters, not interpolated search", async () => {
  const h = databaseHarness();
  const search = "acme'); DROP TABLE users; --";
  const report = await loadAdminUsage({ range: "7d", page: 2, search, product: "secrets", organizationId: "org-id" }, { database: h.database, now });
  assert.deepEqual(h.calls.slice(0, 3).map(call => call.sql), ["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SET LOCAL statement_timeout = '10s'", "SET LOCAL TIME ZONE 'UTC'"]);
  assert.equal(h.calls.length, 7, "Three bounded aggregate queries share one transaction");
  assert.equal(h.calls.at(-1)?.sql, "COMMIT");
  assert.equal(h.releases(), 1);
  assert.deepEqual(h.calls[3].params, ["2026-10-11T00:00:00.000Z", now.toISOString(), "org-id", search, "secrets", ADMIN_USAGE_PAGE_SIZE, ADMIN_USAGE_PAGE_SIZE, "2026-10-01"]);
  assert.equal(h.calls[3].sql.includes(search), false);
  assert.deepEqual(h.calls[4].params, ["2026-10-11T00:00:00.000Z", now.toISOString(), "org-id"], "Table search/product filters do not narrow the global daily series");
  assert.deepEqual(h.calls[5].params, ["2026-05-01", "2026-10-01", "org-id"]);
  assert.deepEqual(report.summary, { organizations: 3, users: 4, adoptedOrganizations: 2, multiProductOrganizations: 1, productConfigurations: 5 });
  assert.deepEqual(report.pagination, { page: 2, pageSize: 25, total: 28, totalPages: 2 });
  assert.equal(report.organizations[0].lastActivityAt, "2026-10-17T13:00:00.000Z");
  assert.equal(report.organizations[0].secrets, 6);
});

test("usage zero-fills exact UTC calendar windows and six telemetry months without mixing activity definitions", async () => {
  for (const [range, days, firstDate] of [["7d", 7, "2026-10-11"], ["30d", 30, "2026-09-18"], ["90d", 90, "2026-07-20"]] as const) {
    const h = databaseHarness();
    const report = await loadAdminUsage({ range }, { database: h.database, now });
    assert.equal(report.daily.length, days);
    assert.equal(report.daily[0].date, firstDate);
    assert.deepEqual(report.daily[0], { date: firstDate, secretOperations: 0, uptimeChecks: 0, agentRuns: 0, agentTokens: 0, tunnelsCreated: 0 });
    assert.deepEqual(report.daily.at(-1), { date: "2026-10-17", secretOperations: 5, uptimeChecks: 12, agentRuns: 3, agentTokens: 100, tunnelsCreated: 2 });
    assert.deepEqual(report.telemetryMonthly, [
      { month: "2026-05", bytes: 0, organizations: 0 }, { month: "2026-06", bytes: 0, organizations: 0 },
      { month: "2026-07", bytes: 0, organizations: 0 }, { month: "2026-08", bytes: 0, organizations: 0 },
      { month: "2026-09", bytes: 0, organizations: 0 }, { month: "2026-10", bytes: 4096, organizations: 1 },
    ]);
    assert.equal(report.products.find(p => p.id === "observability")?.activityWindow, "month");
    assert.equal(report.products.find(p => p.id === "secrets")?.activityWindow, "range");
    assert.equal(report.products.find(p => p.id === "observability")?.metrics[0].format, "bytes");
    assert.equal(report.products.find(p => p.id === "uptime")?.metrics.at(-1)?.value, 10 / 12 * 100);
    assert.match(report.coverage.join(" "), /not HTTP requests or live connections/);
  }
});

test("usage zero-filling crosses UTC year/month boundaries independently of host time zone", async () => {
  const h = databaseHarness();
  const report = await loadAdminUsage({ range: "7d" }, { database: h.database, now: new Date("2027-01-01T00:00:00Z") });
  assert.equal(report.period.from, "2026-12-26T00:00:00.000Z");
  assert.equal(report.daily.length, 7);
  assert.equal(report.daily.at(-1)?.date, "2027-01-01");
  assert.deepEqual(report.telemetryMonthly.map(row => row.month), ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
});

test("empty usage remains a genuine zero snapshot without invented success percentages", async () => {
  const data = fixture();
  data.summary = Object.fromEntries(Object.keys(data.summary).map(key => [key, "0"])) as typeof data.summary;
  data.totals = Object.fromEntries(Object.keys(data.totals).map(key => [key, "0"])) as typeof data.totals;
  data.total = "0";
  data.organizations = [];
  const h = databaseHarness({ snapshot: data });
  const report = await loadAdminUsage({}, { database: h.database, now });
  assert.equal(report.summary.organizations, 0);
  assert.deepEqual(report.organizations, []);
  assert.equal(report.pagination.totalPages, 0);
  assert.equal(report.products.find(product => product.id === "uptime")?.metrics.at(-1)?.value, null);
});

test("invalid input never acquires a connection; read failures roll back and release", async () => {
  const invalid = databaseHarness();
  await assert.rejects(loadAdminUsage({ range: "all" as "30d" }, { database: invalid.database, now }), AdminUsageInputError);
  assert.equal(invalid.connections(), 0);
  const failed = databaseHarness({ failAt: adminUsageDailySql });
  await assert.rejects(loadAdminUsage({}, { database: failed.database, now }), /Deliberate read failure/);
  assert.equal(failed.calls.at(-1)?.sql, "ROLLBACK");
  assert.equal(failed.releases(), 1);
  assert.equal(failed.calls.some(call => call.sql === "COMMIT"), false);
});

test("invalid or unsafe database aggregate values fail closed instead of rounding or emitting NaN", async () => {
  for (const value of ["9007199254740993", "NaN", "Infinity", "-1", "1.5", ""]) {
    const data = fixture();
    data.totals.agent_tokens = value;
    const h = databaseHarness({ snapshot: data });
    await assert.rejects(loadAdminUsage({}, { database: h.database, now }), /aggregate/);
    assert.equal(h.calls.at(-1)?.sql, "ROLLBACK");
    assert.equal(h.releases(), 1);
  }
});

type Handlers = { GET(input: { request: Request }): Promise<Response> };
function adminJson(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "private, no-store" } });
}
async function routeHarness(denied: Response | null = null) {
  const calls = { auth: 0, parse: 0, cache: 0, load: 0, keys: [] as string[] };
  const handlers = await loadRouteHandlers<Handlers>({
    path: new URL("../src/routes/api/admin/usage.ts", import.meta.url),
    modules: {
      "../../../lib/admin-access.server": { adminJson, async requireAdminAccess() { calls.auth += 1; return denied; } },
      "../../../lib/admin-usage.server": { AdminUsageInputError,
        parseAdminUsageParams(query: URLSearchParams) { calls.parse += 1; return parseAdminUsageParams(query); },
        async loadAdminUsage(params: unknown) { calls.load += 1; return { params }; },
      },
      "../../../lib/dashboard-cache": { async cachedDashboardRead(key: string, read: () => Promise<unknown>) { calls.cache += 1; calls.keys.push(key); return read(); } },
    },
  });
  return { ...handlers, calls };
}

test("usage API rejects unauthorized callers before parsing filters, cache reads or database work", async () => {
  for (const status of [401, 403]) {
    const denied = adminJson({ error: "Denied" }, { status });
    const h = await routeHarness(denied);
    assert.equal(await h.GET({ request: new Request("https://outray.co/api/admin/usage?range=invalid") }), denied);
    assert.deepEqual(h.calls, { auth: 1, parse: 0, cache: 0, load: 0, keys: [] });
  }
});

test("usage API gives invalid filters a private uncached 400 without querying usage", async () => {
  const h = await routeHarness();
  const response = await h.GET({ request: new Request("https://outray.co/api/admin/usage?range=all") });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(h.calls.load, 0);
  assert.equal(h.calls.cache, 0);
});

test("usage API caches only after fresh authorization and cannot collide search/scope cache keys", async () => {
  const h = await routeHarness();
  for (const query of ["search=a%26organizationId%3Db", "search=a&organizationId=b"]) {
    const response = await h.GET({ request: new Request(`https://outray.co/api/admin/usage?${query}`) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(h.calls.auth, 2);
  assert.equal(h.calls.load, 2);
  assert.notEqual(h.calls.keys[0], h.calls.keys[1]);
});
