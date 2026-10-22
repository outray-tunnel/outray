import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function harness(legacy = false) {
  const calls: Array<{ endpoint: string; parameters: Record<string, unknown> }> = [];
  const keys: Array<Record<string, unknown>> = [];
  const source = readFileSync(new URL("../src/routes/api/$orgSlug/observability/requests/index.ts", import.meta.url), "utf8");
  const module = { exports: {} as { Route: { server: { handlers: { GET: (input: { request: Request; params: { orgSlug: string } }) => Promise<Response> } } } } };
  const dependencies: Record<string, unknown> = {
    "@tanstack/react-router": { createFileRoute: () => (route: unknown) => route },
    "@/lib/dashboard-cache": {
      cachedDashboardRead: (_key: string, load: () => unknown) => load(),
      dashboardCacheKey: (_name: string, values: Record<string, unknown>) => { keys.push(values); return JSON.stringify(values); },
    },
    "@/lib/observability-services": { queryObservabilityServiceNames: async () => ["api"] },
    "@/lib/org": { requireOrgFromSlug: async () => ({ organization: { id: "right-org" } }) },
    "@/lib/tinybird": { queryTinybird: async (endpoint: string, parameters: Record<string, unknown>) => {
      calls.push({ endpoint, parameters });
      if (endpoint === "http_request_stats") return [{ total_requests: 10, error_requests: 2, error_rate: 20,
        ...(!legacy ? { client_error_requests: 3, client_error_rate: 30, client_errors_by_status: [[429, 1], [401, 2]] } : {}),
        p95_duration_ms: 42, payload_capture_count: 0, metadata_count: 10 }];
      if (endpoint === "http_requests") return [{ id: "request", status_code: 401, is_error: 0 }];
      return [];
    } },
  };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module, exports: module.exports, Response, URL, Set, console,
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return { calls, keys, get: (query = "") => module.exports.Route.server.handlers.GET({
    request: new Request(`https://console.example/api/acme/observability/requests?${query}`), params: { orgSlug: "acme" },
  }) };
}

test("request API preserves server failures and returns 4xx totals and a sorted status breakdown separately", async () => {
  const h = harness(); const response = await h.get(); const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.statistics.errorCount, 2); assert.equal(body.statistics.errorRate, 20);
  assert.equal(body.statistics.clientErrorCount, 3); assert.equal(body.statistics.clientErrorRate, 30);
  assert.deepEqual(body.statistics.clientErrorsByStatus, [{ statusCode: 401, count: 2 }, { statusCode: 429, count: 1 }]);
  assert.equal(body.requests[0].statusCode, 401); assert.equal(body.requests[0].isError, false);
  assert.ok(h.calls.every(({ parameters }) => parameters.organization_id === "right-org"));
});

test("4xx category and exact codes scope list, totals and cache identity together", async () => {
  for (const status of ["client_errors", "401", "403", "429"]) {
    const h = harness(); await h.get(`status=${status}`);
    for (const endpoint of ["http_requests", "http_request_stats"]) {
      const parameters = h.calls.find((call) => call.endpoint === endpoint)!.parameters;
      assert.equal(parameters.status, status === "client_errors" ? status : undefined);
      assert.equal(parameters.status_code, status === "client_errors" ? undefined : Number(status));
    }
    assert.equal(h.keys[0].statusCode, status === "client_errors" ? undefined : Number(status));
  }
});

test("invalid exact-status values never enter parameterized Tinybird filters", async () => {
  for (const status of ["401 OR 1=1", "401.0", "0401", "4000", "4xx"]) {
    const h = harness(); await h.get(`status=${encodeURIComponent(status)}`);
    assert.ok(h.calls.every(({ parameters }) => parameters.status === undefined && parameters.status_code === undefined));
  }
});

test("older query deployments expose missing 4xx measurements as unknown, not fabricated zeros", async () => {
  const body = await (await harness(true).get()).json();
  assert.equal(body.statistics.clientErrorCount, null); assert.equal(body.statistics.clientErrorRate, null);
  assert.deepEqual(body.statistics.clientErrorsByStatus, []);
});

test("HTTP list, details, totals and alerts all use 5xx or explicitly failed spans", () => {
  for (const endpoint of ["http_requests", "http_request_details", "http_request_stats", "alert_http_service"]) {
    const pipe = readFileSync(new URL(`../../../tinybird/endpoints/${endpoint}.pipe`, import.meta.url), "utf8");
    assert.match(pipe, /StatusCode = 2 OR status_code >= 500/);
    assert.doesNotMatch(pipe, /StatusCode = 2 OR status_code >= 400/);
    assert.match(pipe, /nullIf\(SpanAttributes\['http\.response\.status_code'\], ''\)[\s\S]*nullIf\(SpanAttributes\['http\.status_code'\], ''\)[\s\S]*nullIf\(SpanAttributes\['outray\.http\.response\.status_code'\], ''\)/);
  }
  for (const endpoint of ["service_catalog", "service_traffic"]) {
    const pipe = readFileSync(new URL(`../../../tinybird/endpoints/${endpoint}.pipe`, import.meta.url), "utf8");
    assert.match(pipe, /StatusCode = 2[\s\S]*toUInt16OrZero\(coalesce\([\s\S]*outray\.http\.response\.status_code[\s\S]*\)\) >= 500/);
  }
  for (const endpoint of ["http_requests", "http_request_stats"]) {
    const pipe = readFileSync(new URL(`../../../tinybird/endpoints/${endpoint}.pipe`, import.meta.url), "utf8");
    assert.match(pipe, /status_code >= 400 AND status_code < 500 AS is_client_error/);
    assert.match(pipe, /'client_errors', is_client_error/);
    assert.match(pipe, /'success', status_code >= 200 AND status_code < 400 AND not is_error/);
  }
});
