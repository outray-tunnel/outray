import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as orm from "drizzle-orm";
import { getTableName, type SQL } from "drizzle-orm";
import { QueryBuilder, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import ts from "typescript";
import * as schema from "../src/db/alerts-schema";
import * as serializers from "../src/lib/observability/alert-api";
import { alertFixture } from "./fixtures/observability-alert";

interface HandlerInput {
  request: Request;
  params: { orgSlug: string; alertId: string };
}

interface RouteOptions {
  server: { handlers: { GET: (input: HandlerInput) => Promise<Response> } };
}

const organizationId = "tenant-a";
const alertId = "rule-a";
const date = new Date("2026-10-05T12:00:00.000Z");
const alertRow = {
  ...alertFixture(), organizationId, deletedAt: null,
  notificationSlackWebhook: null, notificationDiscordWebhook: null,
  mutedUntil: null, lastEvaluatedAt: date, nextEvaluationAt: date,
  lastStateChangedAt: date, createdAt: date, updatedAt: date,
};
const incidentRows = [
  {
    id: "incident-open", sourceType: "observability_alert", sourceId: alertId,
    status: "open", title: "API error rate", triggerValue: 8.25, lastValue: 9,
    resolvedValue: null, startedAt: date, resolvedAt: null, createdAt: date, updatedAt: date,
  },
  {
    id: "incident-resolved", sourceType: "observability_alert", sourceId: alertId,
    status: "resolved", title: "Earlier API errors", triggerValue: 7, lastValue: 0,
    resolvedValue: 0, startedAt: new Date("2026-10-04T10:00:00Z"),
    resolvedAt: new Date("2026-10-04T10:05:00Z"), createdAt: date, updatedAt: date,
  },
];

/** Load the real GET handler without the application's connection or migrations.
 * Real Drizzle tables and query builders compile every captured statement; the
 * legacy driver rejects Uptime-only incident columns just like PostgreSQL.
 */
async function loadHandler(options: { authorizationError?: Response; missingAlert?: boolean } = {}) {
  const source = await readFile(new URL("../src/routes/api/$orgSlug/observability/alerts/$alertId.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const queries: Array<{ table: string; sql: string; params: unknown[]; fields: string[] }> = [];
  const rows: Record<string, unknown[]> = {
    observability_alerts: options.missingAlert ? [] : [alertRow],
    observability_alert_evaluations: [], incidents: incidentRows, notifications: [],
  };
  const db = {
    select(fields?: Record<string, PgColumn>) {
      let table: PgTable;
      let predicate: SQL | undefined;
      let order: SQL[] = [];
      let limit: number | undefined;
      const selection = {
        from(value: PgTable) { table = value; return selection; },
        where(value: SQL) { predicate = value; return selection; },
        orderBy(...values: SQL[]) { order = values; return selection; },
        limit(value: number) { limit = value; return selection; },
        then(resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
          const builder = new QueryBuilder();
          const query = fields ? builder.select(fields).from(table) : builder.select().from(table);
          if (predicate) query.where(predicate);
          if (order.length) query.orderBy(...order);
          if (limit !== undefined) query.limit(limit);
          const generated = query.toSQL();
          const tableName = getTableName(table);
          queries.push({ table: tableName, ...generated, fields: Object.keys(fields ?? orm.getTableColumns(table)) });
          if (tableName === "incidents" && /uptime_publication_state|uptime_published_at/.test(generated.sql)) {
            return Promise.reject(new Error('column "uptime_publication_state" does not exist')).then(resolve, reject);
          }
          assert.ok(tableName in rows, `Unexpected table: ${tableName}`);
          return Promise.resolve(rows[tableName]).then(resolve, reject);
        },
      };
      return selection;
    },
  };
  const authorizationCalls: Array<{ request: Request; orgSlug: string }> = [];
  const module = { exports: {} as { Route: RouteOptions } };
  runInNewContext(compiled, {
    module, exports: module.exports, Response, URL, Date, Set,
    require: (specifier: string) => {
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (route: RouteOptions) => route };
      if (specifier === "drizzle-orm") return orm;
      if (specifier === "@/db") return { db };
      if (specifier === "@/db/alerts-schema") return schema;
      if (specifier === "@/lib/observability/alert-api") return serializers;
      if (specifier === "@/lib/observability/alert-oauth") return { alertOAuthCredentials: (provider: string) => provider === "slack" ? {} : null };
      if (specifier === "@/lib/org") return {
        requireOrgFromSlug: async (request: Request, orgSlug: string) => {
          authorizationCalls.push({ request, orgSlug });
          return options.authorizationError ? { error: options.authorizationError } : { organization: { id: organizationId } };
        },
      };
      if (["@/lib/observability/alert-access", "@/lib/observability/alert-metric", "@/lib/observability/alert-validation"].includes(specifier)) return {};
      throw new Error(`Unexpected Alert API dependency: ${specifier}`);
    },
  });
  return {
    queries, authorizationCalls,
    get(search = "") {
      return module.exports.Route.server.handlers.GET({
        request: new Request(`https://local.test/api/outray-tunnel/observability/alerts/${alertId}${search}`),
        params: { orgSlug: "outray-tunnel", alertId },
      });
    },
  };
}

test("alert detail works with legacy incident columns and keeps complete history serialization", async () => {
  const harness = await loadHandler();
  const response = await harness.get();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.alert.id, alertId);
  assert.equal(body.alert.openIncidentId, "incident-open");
  assert.deepEqual(body.incidents, incidentRows.map(serializers.serializeIncident));
  assert.deepEqual(body.evaluations, []);
  assert.deepEqual(body.notifications, []);
  assert.deepEqual(body.integrationAvailability, { slack: true, discord: false });
  const incidentQuery = harness.queries.find((query) => query.table === "incidents")!;
  assert.doesNotMatch(incidentQuery.sql, /uptime_publication_state|uptime_published_at|source_snapshot/);
  assert.deepEqual(incidentQuery.fields.sort(), [
    "id", "sourceType", "sourceId", "status", "title", "triggerValue", "lastValue", "resolvedValue",
    "startedAt", "resolvedAt", "createdAt", "updatedAt",
  ].sort());
});

test("the narrow projection preserves tenant, source and rule isolation plus newest-first history limits", async () => {
  const harness = await loadHandler();
  await harness.get("?incidentLimit=75&evaluationLimit=150&notificationLimit=60");
  const incidentQuery = harness.queries.find((query) => query.table === "incidents")!;
  assert.match(incidentQuery.sql, /where \("incidents"\."organization_id" = \$1 and "incidents"\."source_type" = \$2 and "incidents"\."source_id" = \$3\)/);
  assert.match(incidentQuery.sql, /order by "incidents"\."started_at" desc limit \$4$/);
  assert.deepEqual(incidentQuery.params, [organizationId, "observability_alert", alertId, 75]);
  const ruleQuery = harness.queries.find((query) => query.table === "observability_alerts")!;
  assert.match(ruleQuery.sql, /"deleted_at" is null/);
  assert.deepEqual(ruleQuery.params, [alertId, organizationId, 1]);
  assert.equal(harness.queries.find((query) => query.table === "observability_alert_evaluations")?.params.at(-1), 150);
  assert.equal(harness.queries.find((query) => query.table === "notifications")?.params.at(-1), 60);
});

test("detail history limits remain bounded and invalid inputs keep existing defaults", async () => {
  for (const [search, expected] of [
    ["?incidentLimit=9999", 100], ["?incidentLimit=-1", 50],
    ["?incidentLimit=bad", 50], ["?incidentLimit=1.5", 50], ["?incidentLimit=1", 1],
  ] as const) {
    const harness = await loadHandler();
    assert.equal((await harness.get(search)).status, 200);
    assert.equal(harness.queries.find((query) => query.table === "incidents")?.params.at(-1), expected);
  }
});

test("unauthorized detail reads return the access response before querying any tables", async () => {
  const denied = Response.json({ error: "Forbidden" }, { status: 403 });
  const harness = await loadHandler({ authorizationError: denied });
  assert.equal(await harness.get(), denied);
  assert.equal(harness.authorizationCalls.length, 1);
  assert.equal(harness.authorizationCalls[0].orgSlug, "outray-tunnel");
  assert.deepEqual(harness.queries, []);
});

test("a missing or inaccessible rule returns 404 without reading incident history", async () => {
  const harness = await loadHandler({ missingAlert: true });
  const response = await harness.get();
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Alert not found" });
  assert.deepEqual(harness.queries.map((query) => query.table), ["observability_alerts"]);
});
