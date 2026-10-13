import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import ts from "typescript";
import type { SecretsTransaction } from "../src/lib/secrets/database";
import * as bridge from "../src/lib/observability/alert-status-page";
import { PublishError } from "../src/lib/uptime/incident-api";

const config = { publicTitle: "API performance degraded", impact: "degraded" as const, componentIds: ["component-a"] };
const episode = { id: "canonical-a", organizationId: "tenant-a", sourceType: "observability_alert", sourceId: "alert-a",
  status: "open", uptimePublicationState: null, sourceSnapshot: { service: "private-service", threshold: 99 } };

function database(selectRows: unknown[][]) {
  const rows = [...selectRows];
  const calls: string[] = [];
  const predicates: Array<{ sql: string; params: unknown[] }> = [];
  const writes: Array<{ table: string; values: unknown }> = [];
  const tx = {
    select() {
      let table = "";
      const selection = {
        from(value: PgTable) { table = getTableName(value); calls.push(`select:${table}`); return selection; },
        leftJoin() { return selection; },
        where(value: SQL) { predicates.push(new PgDialect().sqlToQuery(value)); return selection; },
        orderBy() { return selection; }, limit() { return selection; },
        for(mode: string) { calls.push(`lock:${table}:${mode}`); return selection; },
        then(resolve: (value: unknown[]) => unknown) {
          assert.ok(rows.length, `Unexpected query: ${table}`);
          return Promise.resolve(rows.shift()!).then(resolve);
        },
      };
      return selection;
    },
    update(value: PgTable) {
      const table = getTableName(value); calls.push(`update:${table}`);
      return { set(values: unknown) { writes.push({ table, values }); return { where(predicate: SQL) {
        predicates.push(new PgDialect().sqlToQuery(predicate)); return Promise.resolve();
      } }; } };
    },
    insert(value: PgTable) {
      const table = getTableName(value); calls.push(`insert:${table}`);
      return { values(values: unknown) { writes.push({ table, values }); return Promise.resolve(); } };
    },
    delete(value: PgTable) {
      const table = getTableName(value); calls.push(`delete:${table}`);
      return { where(predicate: SQL) { predicates.push(new PgDialect().sqlToQuery(predicate)); return Promise.resolve(); } };
    },
  } as unknown as SecretsTransaction;
  return { tx, calls, predicates, writes, unused: () => rows.length };
}

test("mapping validation is strict, bounded, deduplicated, and requires a separately written public title", () => {
  assert.deepEqual(bridge.parseAlertStatusPageInput({ ...config, componentIds: ["component-a", "component-a"] }), { success: true, data: config });
  for (const value of [{ ...config, publicTitle: " " }, { ...config, publicTitle: "x".repeat(161) },
    { ...config, impact: "operational" }, { ...config, automatic: true }, { ...config, componentIds: [4] },
    { ...config, componentIds: Array.from({ length: 101 }, () => "a") }]) {
    assert.equal(bridge.parseAlertStatusPageInput(value).success, false);
  }
  assert.deepEqual(bridge.parseAlertStatusPageInput({ publicTitle: "", impact: "degraded", componentIds: [] }),
    { success: true, data: { publicTitle: null, impact: "degraded", componentIds: [] } });
});

test("linking reuses and promotes the existing canonical episode with tenant-scoped snapshot links", async () => {
  const mock = database([[{ id: "tenant-a" }], [{ id: "alert-a" }], [{ id: "page-a" }], [{ id: "component-a", name: "Public API" }], [episode]]);
  assert.deepEqual(await bridge.saveAlertStatusPage(mock.tx, { organizationId: "tenant-a", alertId: "alert-a", data: config }), { incidentId: episode.id });
  assert.deepEqual(mock.calls.slice(0, 4), ["select:organizations", "lock:organizations:update", "select:observability_alerts", "lock:observability_alerts:update"]);
  assert.ok(mock.calls.includes("lock:incidents:update"));
  assert.ok(!mock.calls.includes("insert:incidents"));
  const update = mock.writes.find((write) => write.table === "incidents")!.values as Record<string, unknown>;
  assert.equal(update.uptimePublicationState, "detected");
  assert.equal(update.publicTitle, config.publicTitle);
  assert.equal(update.publicImpact, "degraded");
  assert.deepEqual(update.sourceSnapshot, { ...episode.sourceSnapshot, affectedComponents: [{ id: "component-a", name: "Public API" }] });
  assert.deepEqual(mock.writes.find((write) => write.table === "uptime_incident_components")!.values,
    [{ organizationId: "tenant-a", incidentId: episode.id, componentId: "component-a" }]);
  assert.ok(mock.predicates.every((predicate) => predicate.params.includes("tenant-a")));
  assert.equal(mock.unused(), 0);
});

test("unavailable, foreign, or hidden components cannot be linked or written", async () => {
  const mock = database([[{ id: "tenant-a" }], [{ id: "alert-a" }], [{ id: "page-a" }], []]);
  await assert.rejects(bridge.saveAlertStatusPage(mock.tx, { organizationId: "tenant-a", alertId: "alert-a", data: config }),
    (error: unknown) => error instanceof PublishError && error.status === 400 && error.field === "componentIds");
  assert.deepEqual(mock.writes, []);
  const query = mock.predicates.at(-1)!;
  assert.match(query.sql, /"uptime_status_components"\."organization_id"/);
  assert.match(query.sql, /"uptime_status_components"\."page_id"/);
  assert.match(query.sql, /"uptime_status_components"\."visible"/);
  assert.match(query.sql, /"uptime_status_groups"\."visible"/);
  assert.ok(query.params.includes("component-a") && query.params.includes("page-a"));
});

test("link edits and unlinking never rewrite approved or ignored episode snapshots", async () => {
  for (const state of ["published", "ignored"]) {
    const mock = database([[{ id: "tenant-a" }], [{ id: "alert-a" }], [{ id: "page-a" }], [{ id: "component-a", name: "API" }], [{ ...episode, uptimePublicationState: state }]]);
    await bridge.saveAlertStatusPage(mock.tx, { organizationId: "tenant-a", alertId: "alert-a", data: config });
    assert.ok(!mock.calls.includes("update:incidents"));
    assert.ok(!mock.calls.includes("delete:uptime_incident_components"));
  }
  const unlink = database([[{ id: "tenant-a" }], [{ id: "alert-a" }], [{ id: "page-a" }], [{ ...episode, uptimePublicationState: "detected" }]]);
  await bridge.saveAlertStatusPage(unlink.tx, { organizationId: "tenant-a", alertId: "alert-a", data: { publicTitle: null, impact: "degraded", componentIds: [] } });
  assert.ok(unlink.calls.includes("delete:uptime_component_alerts"));
  assert.ok(!unlink.calls.includes("update:incidents"));
  assert.ok(!unlink.calls.includes("delete:uptime_incident_components"));
});

test("missing and other-tenant alerts stop before any mapping reads or writes", async () => {
  const mock = database([[{ id: "tenant-a" }], []]);
  assert.equal(await bridge.saveAlertStatusPage(mock.tx, { organizationId: "tenant-a", alertId: "alert-a", data: config }), null);
  assert.deepEqual(mock.writes, []);
  assert.match(mock.predicates[1].sql, /"deleted_at" is null/);
  assert.ok(mock.predicates[1].params.includes("alert-a") && mock.predicates[1].params.includes("tenant-a"));
});

test("mapping read reports grouped visibility without exposing the raw alert configuration", async () => {
  const mock = database([
    [{ id: "alert-a", publicTitle: config.publicTitle, impact: "outage" }], [{ id: "page-a", name: "Services", slug: "services", published: true }],
    [{ id: "component-a", name: "API", visible: true, groupId: "group-a", groupName: "Production services", groupVisible: false }],
    [{ componentId: "component-a" }], [{ id: episode.id }],
  ]);
  const result = await bridge.loadAlertStatusPage(mock.tx, "tenant-a", "alert-a");
  assert.deepEqual(result?.link, { publicTitle: config.publicTitle, impact: "outage", componentIds: ["component-a"] });
  assert.equal(result?.components[0].visible, false);
  assert.equal(result?.components[0].groupName, "Production services");
  assert.equal(result?.incidentId, episode.id);
  assert.doesNotMatch(JSON.stringify(result), /threshold|logQuery|private-service/);
  assert.ok(mock.predicates.every((predicate) => predicate.params.includes("tenant-a")));
});

test("status-page routes return read and manager authorization failures before touching storage", async () => {
  const source = await readFile(new URL("../src/routes/api/$orgSlug/observability/alerts/$alertId.status-page.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const deniedRead = Response.json({ error: "Unauthorized" }, { status: 401 });
  const deniedManager = Response.json({ error: "Forbidden" }, { status: 403 });
  const module = { exports: {} as any };
  runInNewContext(compiled, { module, exports: module.exports, Response,
    require: (name: string) => {
      if (name === "@tanstack/react-router") return { createFileRoute: () => (route: unknown) => route };
      if (name === "@/db") return { db: { transaction() { assert.fail("Unauthorized storage call"); } } };
      if (name === "@/lib/observability/alert-status-page") return { ...bridge, loadAlertStatusPage() { assert.fail("Unauthorized storage read"); } };
      if (name === "@/lib/uptime/api") return { requireUptimeRead: async () => ({ error: deniedRead }), requireUptimeManager: async () => ({ error: deniedManager }) };
      if (name === "@/lib/uptime/incident-api") return { PublishError };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const handlers = module.exports.Route.server.handlers;
  const input = { request: new Request("https://local.test/api/acme/observability/alerts/alert-a/status-page"), params: { orgSlug: "acme", alertId: "alert-a" } };
  assert.equal(await handlers.GET(input), deniedRead);
  assert.equal(await handlers.PATCH(input), deniedManager);
});

test("mapping PATCH returns the full refreshed manager-readable shape rather than a partial cache payload", async () => {
  const source = await readFile(new URL("../src/routes/api/$orgSlug/observability/alerts/$alertId.status-page.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const refreshed = { link: config, page: { id: "page-a", name: "Services", slug: "services", published: true },
    components: [{ id: "component-a", name: "API", visible: true, groupId: null }], incidentId: episode.id };
  const module = { exports: {} as any };
  const calls: string[] = [];
  const tx = {};
  runInNewContext(compiled, { module, exports: module.exports, Response,
    require: (name: string) => {
      if (name === "@tanstack/react-router") return { createFileRoute: () => (route: unknown) => route };
      if (name === "@/db") return { db: { transaction: (run: (value: unknown) => unknown) => run(tx) } };
      if (name === "@/lib/observability/alert-status-page") return { ...bridge,
        async saveAlertStatusPage(value: unknown, input: { organizationId: string; alertId: string }) {
          assert.equal(value, tx); assert.equal(input.organizationId, "tenant-a"); assert.equal(input.alertId, "alert-a");
          calls.push("save"); return { incidentId: episode.id };
        },
        async loadAlertStatusPage(value: unknown, organizationId: string, alertId: string) {
          assert.equal(value, tx); assert.equal(organizationId, "tenant-a"); assert.equal(alertId, "alert-a");
          calls.push("refresh"); return refreshed;
        },
      };
      if (name === "@/lib/uptime/api") return { requireUptimeManager: async () => ({ organization: { id: "tenant-a" } }),
        jsonBody: (request: Request) => request.json(), badInput: (error: string, field?: string) => Response.json({ error, field }, { status: 400 }) };
      if (name === "@/lib/uptime/incident-api") return { PublishError };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const invoke = (body: unknown) => module.exports.Route.server.handlers.PATCH({ request: new Request("https://local.test/api/acme/observability/alerts/alert-a/status-page", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), params: { orgSlug: "acme", alertId: "alert-a" } });
  const response = await invoke(config);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ...refreshed, canManage: true });
  assert.deepEqual(calls, ["save", "refresh"]);
  calls.length = 0;
  assert.equal((await invoke({ ...config, publicTitle: " " })).status, 400);
  assert.deepEqual(calls, []);
});
