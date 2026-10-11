import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getPlanLimits, installationPlan, type SubscriptionPlan } from "../src/lib/subscription-plans";
import { isAlertManagerRole, validateAlertCreateInput, validateAlertPatchInput } from "../src/lib/observability/alert-validation";
import { UPTIME_LIMITS, validateMonitorInput } from "../src/lib/uptime/validation";

type Row = Record<string, any>;
type Predicate = { type: string; field?: string; value?: any; conditions?: Predicate[] };
type Handler = (args: { request: Request; params: { orgSlug: string; monitorId?: string; alertId?: string } }) => Promise<Response>;
const table = (name: string) => new Proxy({ table: name }, { get: (target, key) => key === "table" ? target.table : `${name}.${String(key)}` });
const matches = (row: Row, condition?: Predicate): boolean => !condition || (condition.type === "and"
  ? condition.conditions!.every((child) => matches(row, child))
  : condition.type === "isNull" ? row[condition.field!.split(".")[1]] == null
    : condition.type === "inArray" ? condition.value.includes(row[condition.field!.split(".")[1]])
      : row[condition.field!.split(".")[1]] === condition.value);
const compiled = new Map<string, string>();
async function load(path: string, modules: Record<string, unknown>) {
  if (!compiled.has(path)) compiled.set(path, ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText);
  const module = { exports: {} as any };
  runInNewContext(compiled.get(path)!, {
    module, exports: module.exports, Date, Response, Request, URL, crypto: { randomUUID }, console,
    require: (name: string) => {
      if (name === "@tanstack/react-router") return { createFileRoute: () => (definition: unknown) => definition };
      assert.ok(Object.hasOwn(modules, name), `Unexpected quota dependency: ${name}`);
      return modules[name];
    },
  });
  return module.exports;
}

const monitorInput = { name: "API", url: "https://api.example.com/health" };
const alertInput = { name: "API errors", signal: "request_error_rate", service: "api", operator: "gt", threshold: 5, windowMinutes: 5 };

async function harness(kind: "monitors" | "alerts", options: { plan?: SubscriptionPlan; count?: number; role?: string } = {}) {
  const organizationId = "url-org";
  const records = table(kind), organizations = table("organizations"), subscriptions = table("subscriptions");
  const rowInput = kind === "monitors" ? validateMonitorInput(monitorInput) : validateAlertCreateInput(alertInput);
  assert.equal(rowInput.success, true);
  const rows: Record<string, Row[]> = {
    organizations: [{ id: organizationId }, { id: "active-org" }],
    subscriptions: options.plan ? [{ organizationId, plan: options.plan }, { organizationId: "active-org", plan: "pulse" }] : [{ organizationId: "active-org", plan: "pulse" }],
    [kind]: Array.from({ length: options.count ?? 0 }, (_, index) => ({ ...(rowInput.success ? rowInput.data : {}), id: `existing-${index}`, organizationId, deletedAt: null, headersCiphertext: null })),
    incidents: [], pages: [{ id: "status-page", organizationId, domainId: null }], domains: [],
  };
  rows[kind].push({ id: "deleted", organizationId, deletedAt: new Date() });
  for (let index = 0; index < 120; index++) rows[kind].push({ id: `foreign-${index}`, organizationId: "active-org", deletedAt: null });
  const calls: Array<{ operation: string; table?: string; transaction: number; conditions?: Predicate }> = [];
  let tail: Promise<unknown> = Promise.resolve(), transactionId = 0;
  const database = (transaction: number) => ({
    select(fields?: Row) {
      let selected: { table: string }, conditions: Predicate | undefined, limit: number | undefined, locked = false;
      const builder = {
        from(value: { table: string }) { selected = value; return builder; },
        where(value: Predicate) { conditions = value; return builder; },
        orderBy() { return builder; },
        for(value: string) { locked = value === "update"; return builder; },
        limit(value: number) { limit = value; return builder; },
        then(resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) {
          calls.push({ operation: locked ? "lock" : fields?.count ? "count" : "select", table: selected.table, transaction, conditions });
          const found = (rows[selected.table] ?? []).filter((row) => matches(row, conditions));
          const result = fields?.count ? [{ count: found.length }] : (limit === undefined ? found : found.slice(0, limit));
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
    insert(selected: { table: string }) {
      return { values(values: Row) { return { returning: async () => {
        calls.push({ operation: "insert", table: selected.table, transaction });
        const row = { deletedAt: null, ...values }; rows[selected.table].push(row); return [row];
      } }; } };
    },
    update(selected: { table: string }) {
      return { set(values: Row) {
        let conditions: Predicate;
        const apply = () => {
          calls.push({ operation: "update", table: selected.table, transaction, conditions });
          const found = rows[selected.table].filter((row) => matches(row, conditions));
          found.forEach((row) => Object.assign(row, values)); return found;
        };
        const builder = {
          where(value: Predicate) { conditions = value; return builder; },
          returning: async () => apply(),
          then: (resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(apply()).then(resolve, reject),
        };
        return builder;
      } };
    },
  });
  const db = { ...database(0), transaction<T>(run: (tx: ReturnType<typeof database>) => Promise<T>) {
    // Model serialized transactions; assertions below independently require
    // the route to acquire the organization lock before its plan/count/insert.
    const result = tail.then(() => run(database(++transactionId)));
    tail = result.catch(() => {}); return result;
  } };
  const drizzle = {
    and: (...conditions: Predicate[]): Predicate => ({ type: "and", conditions }),
    eq: (field: string, value: unknown): Predicate => ({ type: "eq", field, value }),
    isNull: (field: string): Predicate => ({ type: "isNull", field }),
    inArray: (field: string, value: unknown): Predicate => ({ type: "inArray", field, value }),
    desc: (field: unknown) => field, sql: () => ({}),
  };
  const entitlements = await load("../src/lib/organization-entitlements.server.ts", {
    "drizzle-orm": drizzle, "../db": { db }, "../db/auth-schema": { organizations }, "../db/subscription-schema": { subscriptions },
    "./subscription-plans": { getPlanLimits, installationPlan },
  });
  const access = async (_request: Request, slug: string) => {
    assert.equal(slug, "url-workspace");
    return { organization: { id: organizationId }, membership: { role: options.role ?? "owner" }, session: { user: { id: "owner" }, session: { activeOrganizationId: "active-org" } } };
  };
  const manage = async (request: Request, slug: string) => isAlertManagerRole(options.role ?? "owner") ? access(request, slug) : { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  const modules = {
    "drizzle-orm": drizzle, "@/db": { db }, "@/db/auth-schema": { organizations }, "@/db/app-schema": { domains: table("domains") },
    "@/db/uptime-schema": { uptimeMonitors: kind === "monitors" ? records : table("monitors"), uptimeStatusPages: table("pages") },
    "@/db/alerts-schema": { observabilityAlerts: records, incidents: table("incidents") },
    "@/lib/organization-entitlements.server": entitlements,
    "@/lib/uptime/api": { requireUptimeRead: access, requireUptimeManager: manage, jsonBody: (request: Request) => request.json(), serializeMonitor: (row: Row) => row,
      badInput: (error: string, field: string) => Response.json({ error, field }, { status: 400 }), notFound: () => Response.json({ error: "Not found" }, { status: 404 }) },
    "@/lib/uptime/validation": { UPTIME_LIMITS, validateMonitorInput },
    "@/lib/observability/alert-access": { requireAlertManager: manage, notificationEmailsBelongToOrganization: async () => true },
    "@/lib/observability/alert-validation": { validateAlertCreateInput, validateAlertPatchInput, isAlertManagerRole },
    "@/lib/observability/alert-api": { alertConfigValues: (row: Row) => row, alertConfigFromRow: (row: Row) => row, serializeAlert: (row: Row) => ({ ...row, state: "no_data" }) },
    "@/lib/observability/alert-metric": {}, "@/lib/observability/alert-oauth": { alertOAuthCredentials: () => null },
    "@/lib/org": { requireOrgFromSlug: access }, "@/lib/secrets/database": {}, "@/lib/secrets/crypto": {},
    "@/lib/uptime/domain-config": { isReservedStatusCustomDomain: () => false, statusDnsTarget: () => "status.example.net" },
  };
  const routeBase = kind === "monitors" ? "uptime/monitors" : "observability/alerts";
  const handlers = (await load(`../src/routes/api/$orgSlug/${routeBase}/index.ts`, modules)).Route.server.handlers as Record<string, Handler>;
  const invoke = (handler: Handler, method: string, body?: unknown, id?: string) => handler({
    request: new Request(`https://console.test/api/url-workspace/${routeBase}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    params: { orgSlug: "url-workspace", monitorId: id, alertId: id },
  });
  return {
    calls, rows,
    get: () => invoke(handlers.GET, "GET"),
    create: (body: unknown = kind === "monitors" ? monitorInput : alertInput) => invoke(handlers.POST, "POST", body),
    async edit(id: string, body: unknown) {
      const detail = (await load(`../src/routes/api/$orgSlug/${routeBase}/$${kind === "monitors" ? "monitor" : "alert"}Id.ts`, modules)).Route.server.handlers;
      return invoke(detail.PATCH, "PATCH", body, id);
    },
    async remove(id: string) {
      const detail = (await load(`../src/routes/api/$orgSlug/${routeBase}/$${kind === "monitors" ? "monitor" : "alert"}Id.ts`, modules)).Route.server.handlers;
      return invoke(detail.DELETE, "DELETE", undefined, id);
    },
    async addStatusDomain() {
      const status = (await load("../src/routes/api/$orgSlug/uptime/domains/index.ts", modules)).Route.server.handlers;
      return invoke(status.POST, "POST", { domain: "status.example.com" });
    },
  };
}

for (const kind of ["monitors", "alerts"] as const) {
  const feature = kind === "monitors" ? "maxUptimeMonitors" : "maxObservabilityAlerts";
  test(`${kind}: Free and paid quotas allow the last slot, reject new growth, and use only the URL organization`, async () => {
    for (const plan of ["free", "ray", "beam", "pulse"] as const) {
      const limit = getPlanLimits(plan)[feature];
      const fixture = await harness(kind, { plan, count: limit - 1 });
      assert.equal((await fixture.get()).status, 200);
      assert.equal((await (await fixture.get()).json()).limit, limit);
      assert.equal((await fixture.create()).status, 201);
      const denied = await fixture.create(); assert.equal(denied.status, 403); assert.equal((await denied.json()).limit, limit);
      const active = fixture.rows[kind].filter((row) => row.organizationId === "url-org" && row.deletedAt === null);
      assert.equal(active.length, limit, "foreign and deleted rows do not consume this workspace's quota");
      for (const id of new Set(fixture.calls.filter((call) => call.transaction).map((call) => call.transaction))) {
        const calls = fixture.calls.filter((call) => call.transaction === id);
        assert.equal(calls[0].operation, "lock"); assert.equal(calls[0].table, "organizations");
        assert.equal(calls[1].table, "subscriptions", "effective plan is read under the lock in the same transaction");
        assert.equal(calls[2].operation, "count");
      }
    }
  });

  test(`${kind}: concurrent creates cannot consume the same final slot`, async () => {
    const fixture = await harness(kind, { count: getPlanLimits("free")[feature] - 1 });
    const responses = await Promise.all([fixture.create(), fixture.create()]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 403]);
  });

  test(`${kind}: downgrade preserves reads, edits, re-enabling and deletes while blocking creation`, async () => {
    const fixture = await harness(kind, { count: getPlanLimits("free")[feature] + 1 });
    const response = await fixture.get(); assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data[kind].length, getPlanLimits("free")[feature] + 1);
    assert.equal((await fixture.create()).status, 403);
    assert.equal((await fixture.edit("existing-0", { name: "Renamed", enabled: true })).status, 200);
    assert.equal((await fixture.remove("existing-0")).status, 200);
    assert.equal(fixture.rows[kind].find((row) => row.id === "existing-0")!.enabled, false);
    assert.equal((await fixture.edit("foreign-0", { name: "Wrong workspace" })).status, 404);
  });

  test(`${kind}: internal Unlimited is not restricted to hosted Free quotas and members cannot create`, async () => {
    const unlimited = await harness(kind, { plan: "unlimited", count: 101 });
    assert.equal((await unlimited.create()).status, 201);
    const member = await harness(kind, { role: "member" });
    assert.equal((await member.create()).status, 403); assert.equal(member.calls.length, 0);
  });

  test(`${kind}: self-hosted administrator capacity overrides the stored subscription`, async () => {
    const keys = ["OUTRAY_DEPLOYMENT_MODE", "OUTRAY_MAX_UPTIME_MONITORS", "OUTRAY_MAX_OBSERVABILITY_ALERTS"];
    const previous = keys.map((key) => process.env[key]);
    Object.assign(process.env, { OUTRAY_DEPLOYMENT_MODE: "self-hosted", OUTRAY_MAX_UPTIME_MONITORS: "2", OUTRAY_MAX_OBSERVABILITY_ALERTS: "2" });
    try {
      const fixture = await harness(kind, { plan: "pulse", count: 1 });
      assert.equal((await (await fixture.get()).json()).limit, 2);
      assert.equal((await fixture.create()).status, 201);
      assert.equal((await fixture.create()).status, 403);
    } finally {
      keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    }
  });
}

test("Free status-page domains remain available despite no tunnel custom domains", async () => {
  assert.equal(getPlanLimits("free").customDomains, false);
  assert.equal(getPlanLimits("free").statusCustomDomains, true);
  const fixture = await harness("monitors");
  const created = await fixture.addStatusDomain(); assert.equal(created.status, 201);
  const data = await created.json(); assert.equal(data.domain.purpose, "status"); assert.equal(data.domain.organizationId, "url-org");
  assert.equal(fixture.rows.pages[0].domainId, data.domain.id);
  assert.equal((await fixture.addStatusDomain()).status, 409, "one page cannot claim a second domain");
});
