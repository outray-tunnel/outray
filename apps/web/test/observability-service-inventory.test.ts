import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const tinybirdFile = (path: string) => readFileSync(new URL(`../../../tinybird/${path}`, import.meta.url), "utf8");

test("service discovery persists only identity metadata from all three telemetry signals", () => {
  const datasource = tinybirdFile("datasources/observability_service_inventory.datasource");
  assert.match(datasource, /ENGINE "ReplacingMergeTree"/);
  assert.match(datasource, /ENGINE_SORTING_KEY "OrganizationId, ServiceName"/);
  assert.match(datasource, /ENGINE_VER LastSeen/);
  assert.doesNotMatch(datasource, /ENGINE_TTL|Body|SpanAttributes|ResourceAttributes/);
  assert.match(datasource, /FORWARD_QUERY >\s+SELECT \*/);
  for (const signal of ["spans", "logs", "metrics"]) {
    const pipe = tinybirdFile(`materializations/service_inventory_${signal}.pipe`);
    assert.match(pipe, new RegExp(`FROM otel_${signal}`));
    assert.match(pipe, /GROUP BY OrganizationId, ServiceName/);
    assert.match(pipe, /max\(Timestamp\) AS LastSeen/);
    assert.match(pipe, /WHERE notEmpty\(ServiceName\)/);
    assert.match(pipe, /TYPE materialized\s+DATASOURCE observability_service_inventory/);
    assert.doesNotMatch(pipe, /now\(\)|INTERVAL|LIMIT|Body|SpanAttributes|ResourceAttributes/);
  }
});

test("inventory is tenant-scoped, unbounded by default, and independent of metrics ranges", () => {
  const catalog = tinybirdFile("endpoints/service_catalog.pipe");
  const inventory = catalog.split("NODE service_inventory\n")[1].split("NODE service_modes\n")[0];
  assert.match(inventory, /FROM observability_service_inventory FINAL/);
  assert.match(inventory, /OrganizationId = \{\{String\(organization_id\)\}\}/);
  assert.match(inventory, /ServiceName = \{\{String\(service\)\}\}/);
  assert.doesNotMatch(inventory, /hours|INTERVAL|LIMIT/);
  assert.match(catalog, /FROM service_inventory AS inventory\s+LEFT JOIN service_rollup/);
  assert.match(catalog, /operation_count = 0, 'unknown'/);
  assert.match(catalog, /countIf\(health IN \('degraded', 'critical'\)\)/);
  assert.match(catalog, /Int32\(hours, 24\)/);
  assert.doesNotMatch(catalog, /Int32\(limit, 250\)/);
  const names = tinybirdFile("endpoints/service_names.pipe");
  assert.match(names, /FROM observability_service_inventory FINAL/);
  assert.match(names, /OrganizationId = \{\{String\(organization_id\)\}\}/);
  assert.doesNotMatch(names, /hours|INTERVAL|Int32\(limit, 250\)/);
});

test("Services API returns the full inventory and preserves unknown health and historical last-seen", async () => {
  const source = readFileSync(new URL("../src/routes/api/$orgSlug/observability/services/index.ts", import.meta.url), "utf8");
  const calls: Array<{ endpoint: string; parameters: Record<string, unknown> }> = [];
  const lastSeen = "2026-01-01 10:00:00.000000000";
  const rows = Array.from({ length: 300 }, (_, index) => ({
    id: `service-${index}`, name: `service-${index}`, namespace: "", version: "", environment: "production",
    region: "", scope_name: "", last_seen: lastSeen, operation_count: 0, error_count: 0,
    error_rate: 0, p95_duration_ms: 0, operations_per_minute: 0, uses_server_spans: 0,
    health: "unknown", total_service_count: 300, total_operation_count: 0,
    total_error_count: 0, total_operations_per_minute: 0, total_attention_count: 0,
  }));
  const dependencies: Record<string, unknown> = {
    "@tanstack/react-router": { createFileRoute: () => (route: unknown) => route },
    "@/lib/dashboard-cache": { cachedDashboardRead: (_key: string, load: () => unknown) => load(), dashboardCacheKey: () => "test" },
    "@/lib/org": { requireOrgFromSlug: async () => ({ organization: { id: "correct-org" } }) },
    "@/lib/tinybird": { queryTinybird: async (endpoint: string, parameters: Record<string, unknown>) => {
      calls.push({ endpoint, parameters });
      return endpoint === "service_catalog" ? rows : [];
    } },
  };
  const module = { exports: {} as { Route: { server: { handlers: { GET: (args: unknown) => Promise<Response> } } } } };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module, exports: module.exports, Response, URL, console,
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  const response = await module.exports.Route.server.handlers.GET({
    request: new Request("https://console.example/api/acme/observability/services?range=1h&service=quiet"), params: { orgSlug: "acme" },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.services.length, 300);
  assert.equal(body.summary.serviceCount, 300);
  assert.equal(body.summary.attentionCount, 0);
  assert.equal(body.services[0].health, "unknown");
  assert.equal(body.services[0].operationCount, 0);
  assert.equal(body.services[0].lastSeen, lastSeen);
  for (const { parameters } of calls) {
    assert.equal(parameters.organization_id, "correct-org");
    assert.equal(parameters.service, "quiet");
    assert.equal(parameters.hours, 1);
    assert.equal(parameters.limit, undefined);
  }
});
