import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import analytics from "../../../shared/status-analytics";
import plans from "../../../shared/hosted-plan-limits";

function harness(options: { paid?: boolean; member?: boolean; found?: boolean; failure?: boolean } = {}) {
  let queries = 0;
  const module = { exports: {} as { getStatusAnalytics: (request: Request, slug: string) => Promise<Response> } };
  const source = readFileSync(new URL("../src/lib/uptime/status-analytics.server.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module, exports: module.exports, URL, Date, Map, Response, console: { error() {} }, require: (name: string) => {
    if (name === "./api") return {
      requireUptimeRead: async () => options.member === false ? { error: Response.json({ error: "Forbidden" }, { status: 403 }) } : { organization: { id: "org-one" } },
      findStatusPage: async (org: string, request: Request) => { assert.equal(org, "org-one"); return options.found === false || new URL(request.url).searchParams.get("pageId") !== "page-one" ? null : { id: "page-one" }; },
      notFound: () => Response.json({ error: "Not found" }, { status: 404 }),
    };
    if (name === "../organization-entitlements.server") return { getOrganizationLimits: async () => ({ statusAnalytics: options.paid !== false, retentionDays: 14 }) };
    if (name === "../../../../../shared/status-analytics") return { default: analytics };
    if (name === "../tinybird") return { queryTinybird: async (endpoint: string, parameters: Record<string, unknown>) => {
      queries++;
      assert.equal(endpoint, "status_page_analytics");
      assert.equal(parameters.organization_id, "org-one");
      assert.equal(parameters.page_id, "page-one");
      assert.equal(parameters.retention_days, 14);
      assert.ok(Number(parameters.end_ms) - Number(parameters.start_ms) <= 14 * 86400_000);
      if (options.failure) throw new Error("private provider response");
      return [{ kind: "summary", label: "", views: "5", visitors: "3" }, { kind: "referrer", label: "example.com", views: "2", visitors: 0 }];
    } };
    throw new Error(name);
  } });
  return { get: (range = "7d", pageId = "page-one") => module.exports.getStatusAnalytics(new Request(`https://console.example/api/acme/uptime/page/analytics?range=${range}&pageId=${pageId}`), "acme"), queries: () => queries };
}

test("status analytics feature is included in every paid plan, never Free", () => {
  assert.equal(plans.HOSTED_PLAN_LIMITS.free.statusAnalytics, false);
  for (const plan of ["ray", "beam", "pulse", "unlimited"] as const) assert.equal(plans.HOSTED_PLAN_LIMITS[plan].statusAnalytics, true);
});

test("analytics denies free accounts and non-members before querying Tinybird", async () => {
  for (const options of [{ paid: false }, { member: false }]) {
    const api = harness(options);
    assert.equal((await api.get()).status, 403);
    assert.equal(api.queries(), 0);
  }
});

test("explicit foreign page IDs never fall back and invalid ranges cannot reach the reporting pipe", async () => {
  const api = harness();
  assert.equal((await api.get("7d", "other-org-page")).status, 404);
  assert.equal((await api.get("arbitrary-sql")).status, 400);
  assert.equal(api.queries(), 0);
});

test("report uses trusted tenant/page IDs, clamps retention, fills empty buckets and excludes visitor identities", async () => {
  const api = harness();
  const response = await api.get("90d");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const report = await response.json();
  assert.equal(report.views, 5); assert.equal(report.visitors, 3);
  assert.equal(report.retentionDays, 14);
  assert.ok(report.series.length <= 15);
  assert.ok(report.series.every((point: { views: number }) => point.views === 0));
  assert.deepEqual(report.referrers, [{ label: "example.com", views: 2 }]);
  assert.doesNotMatch(JSON.stringify(report), /visitor_hash|client_ip/);
});

test("provider failures report unavailable, never fabricated zero traffic or private error bodies", async () => {
  const response = await harness({ failure: true }).get();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private provider/);
});
