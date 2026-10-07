import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { isAlertManagerRole } from "../src/lib/observability/alert-validation";

const fixture = {
  organization: { id: "org-from-url", slug: "url-workspace" }, membership: { role: "owner" },
  session: { user: { id: "member" }, session: { activeOrganizationId: "different-active-org" } },
};

async function compile(path: string) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
}

test("Uptime read access exposes the existing URL membership with no added role query and preserves disabled responses", async () => {
  const compiled = await compile("../src/lib/uptime/api.ts");
  const module = { exports: {} as any };
  const process = { env: { OUTRAY_UPTIME_DISABLED: "false" } };
  const calls: Array<[Request, string]> = [];
  let access: object = fixture;
  runInNewContext(compiled, { process, Response, module, exports: module.exports, require: (specifier: string) => {
    if (specifier === "drizzle-orm") return {};
    if (specifier === "@/db") return { db: new Proxy({}, { get: () => { throw new Error("Read access must not add a database call"); } }) };
    if (specifier === "@/db/auth-schema" || specifier === "@/db/uptime-schema") return {};
    if (specifier === "@/lib/observability/alert-access") return { requireAlertManager: () => {} };
    if (specifier === "@/lib/observability/alert-validation") return { isAlertManagerRole };
    if (specifier === "@/lib/org") return { requireOrgMembershipFromSlug: async (request: Request, slug: string) => { calls.push([request, slug]); return access; } };
    if (specifier === "./state") return {};
    throw new Error(`Unexpected Uptime access dependency: ${specifier}`);
  } });
  const request = new Request("https://example.test/api/url-workspace/uptime/monitors");
  assert.equal(await module.exports.requireUptimeRead(request, "url-workspace"), fixture);
  assert.deepEqual(calls, [[request, "url-workspace"]]);
  const denied = { error: Response.json({ error: "Unauthorized" }, { status: 403 }) };
  access = denied;
  assert.equal(await module.exports.requireUptimeRead(request, "url-workspace"), denied);
  process.env.OUTRAY_UPTIME_DISABLED = "true";
  const disabled = await module.exports.requireUptimeRead(request, "url-workspace");
  assert.equal(disabled.error.status, 503); assert.equal(calls.length, 2, "disabled Uptime bypasses even its normal access resolver");
});

const table = (name: string) => new Proxy({ table: name }, { get: (target, key) => key === "table" ? target.table : `${name}.${String(key)}` });
const monitors = table("monitors"), checks = table("checks"), incidents = table("incidents");
type Predicate = { type: string; field?: string; value?: unknown; conditions?: Predicate[] };
const predicate = (type: string) => (field: string, value?: unknown): Predicate => ({ type, field, value });

async function routeHarness(path: string, role: string, denied = false) {
  const compiled = await compile(path);
  const queries: Array<{ table: string; conditions: Predicate }> = [];
  const scopes: string[] = [], reads: Array<[Request, string]> = [];
  const monitor = { id: "monitor-url", organizationId: fixture.organization.id, name: "API", url: "https://api.example.com/health", method: "GET", expectedStatus: 200, enabled: true, state: "up", lastCheckedAt: new Date(), headersCiphertext: null };
  const deniedResponse = Response.json({ error: "Unauthorized" }, { status: 403 });
  const matches = (conditions: Predicate, name: string, value: unknown): boolean => conditions.type === "eq" && conditions.field === name && conditions.value === value || Boolean(conditions.conditions?.some((child) => matches(child, name, value)));
  const db = { select: (fields?: unknown) => {
    let current: { table: string };
    let conditions: Predicate;
    const results = () => {
      if (current.table === "monitors") return matches(conditions, "monitors.id", "foreign-monitor") ? [] : [monitor];
      if (current.table === "checks") return fields ? [{ total: 1, successful: 1, averageLatencyMs: 20 }] : [{ id: "check-url", success: true, checkedAt: new Date(), latencyMs: 20, statusCode: 200 }];
      return [{ id: "incident-url", organizationId: fixture.organization.id, sourceId: monitor.id, title: "API unavailable", status: "resolved" }];
    };
    const builder = {
      from: (value: { table: string }) => { current = value; return builder; },
      where: (value: Predicate) => { conditions = value; queries.push({ table: current.table, conditions }); return builder; },
      orderBy: () => builder,
      limit: () => Promise.resolve(results()),
      then: (resolve: (value: unknown) => unknown, reject: (cause: unknown) => unknown) => Promise.resolve(results()).then(resolve, reject),
    };
    return builder;
  } };
  const module = { exports: {} as any };
  runInNewContext(compiled, { Response, Date, crypto: {}, module, exports: module.exports, require: (specifier: string) => {
    if (specifier === "@tanstack/react-router") return { createFileRoute: () => (definition: object) => definition };
    if (specifier === "drizzle-orm") return { and: (...conditions: Predicate[]) => ({ type: "and", conditions }), eq: predicate("eq"), isNull: predicate("isNull"), gte: predicate("gte"), desc: (value: unknown) => value, sql: () => ({}) };
    if (specifier === "@/db") return { db };
    if (specifier === "@/db/auth-schema") return { organizations: table("organizations") };
    if (specifier === "@/db/alerts-schema") return { incidents };
    if (specifier === "@/db/uptime-schema") return { uptimeMonitors: monitors, uptimeChecks: checks, uptimeStatusGroups: table("groups"), uptimeStatusPages: table("pages") };
    if (specifier === "@/lib/observability/alert-validation") return { isAlertManagerRole };
    if (specifier === "@/lib/uptime/api") return {
      requireUptimeRead: async (request: Request, slug: string) => { reads.push([request, slug]); return denied ? { error: deniedResponse } : { ...fixture, membership: { role } }; },
      serializeMonitor: (value: object) => value,
      notFound: (label: string) => Response.json({ error: `${label} not found` }, { status: 404 }),
      loadPage: async (orgId: string) => { scopes.push(orgId); return { page: { id: "page-url" }, groups: [], standaloneComponents: [] }; },
    };
    if (specifier === "@/lib/uptime/validation") return { UPTIME_LIMITS: { monitors: 10, checkHistoryDays: 30 } };
    if (specifier === "@/lib/observability/alert-access" || specifier === "@/lib/secrets/database" || specifier === "@/lib/secrets/crypto") return {};
    throw new Error(`Unexpected capability route dependency: ${specifier}`);
  } });
  const get = (monitorId = "monitor-url") => module.exports.Route.server.handlers.GET({ request: new Request("https://example.test/api/url-workspace/uptime"), params: { orgSlug: "url-workspace", monitorId } });
  return { get, queries, scopes, reads, matches };
}

const endpoints = [
  "../src/routes/api/$orgSlug/uptime/monitors/index.ts",
  "../src/routes/api/$orgSlug/uptime/monitors/$monitorId.ts",
  "../src/routes/api/$orgSlug/uptime/page.ts",
];

test("page and monitor reads expose additive capabilities only for the same owner/admin roles as mutation authorization", async () => {
  for (const path of endpoints) for (const role of ["owner", "admin", "member", "unknown", "admin,member"]) {
    const harness = await routeHarness(path, role);
    const response = await harness.get();
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.canManage, role === "owner" || role === "admin", `${path}: ${role}`);
    assert.equal(harness.reads.length, 1); assert.equal(harness.reads[0][1], "url-workspace");
    if (path.endsWith("page.ts")) { assert.deepEqual(harness.scopes, [fixture.organization.id]); assert.equal(data.page.id, "page-url"); assert.deepEqual(data.groups, []); assert.deepEqual(data.standaloneComponents, []); }
    else if (path.endsWith("index.ts")) { assert.equal(data.monitors[0].id, "monitor-url"); assert.equal(data.limit, 10); }
    else { assert.equal(data.monitor.id, "monitor-url"); assert.equal(data.checks[0].id, "check-url"); assert.equal(data.incidents[0].id, "incident-url"); assert.equal(data.summary.observedUptimePercent, 100); }
    for (const query of harness.queries) assert.equal(harness.matches(query.conditions, `${query.table}.organizationId`, fixture.organization.id), true, `${query.table} stays scoped to the URL workspace, not the active workspace`);
  }
});

test("unauthorized reads expose no capability or data, and a foreign monitor cannot load another organization's history", async () => {
  for (const path of endpoints) {
    const harness = await routeHarness(path, "owner", true);
    const response = await harness.get(); assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
    assert.equal(harness.queries.length, 0); assert.equal(harness.scopes.length, 0);
  }
  const harness = await routeHarness(endpoints[1], "owner");
  const response = await harness.get("foreign-monitor"); assert.equal(response.status, 404);
  assert.equal(harness.queries.length, 1, "history queries never run when the organization-scoped monitor lookup fails");
  assert.equal(harness.matches(harness.queries[0].conditions, "monitors.organizationId", fixture.organization.id), true);
});
