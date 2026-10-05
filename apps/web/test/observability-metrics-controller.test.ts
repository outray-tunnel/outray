import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as metricData from "../src/components/observability/metrics-data";
import { observabilityMetricsQuery } from "../src/components/observability/metrics-query";

const snapshot: metricData.MetricsSnapshot = {
  metrics: [], selectedMetric: null, services: [], points: [], breakdown: [], range: "1h",
  requestedRange: "1h", receivedAt: Date.parse("2026-10-05T12:00:00Z"),
};

/** Exercise real route integration with URL state and controlled query snapshots. No network. */
async function loadController(orgSlug = "outray-tunnel", initialSearch: unknown = {}) {
  const source = await readFile(new URL("../src/routes/$orgSlug/observability/metrics.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(`${source}\nexport { WorkspaceMetrics };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  let routeOrg = orgSlug;
  let search = metricData.normalizeMetricsSearch(initialSearch);
  let live = true;
  let retries = 0;
  let result: { data?: metricData.MetricsSnapshot; isPending: boolean; isFetching: boolean; error: Error | null } = {
    data: undefined, isPending: true, isFetching: true, error: null,
  };
  const queryCalls: Array<ReturnType<typeof observabilityMetricsQuery>> = [];
  const navigations: Array<{ search: metricData.MetricsSearch; resetScroll: boolean }> = [];
  const Content = () => null;
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return { useState: () => [live, (next: boolean | ((value: boolean) => boolean)) => { live = typeof next === "function" ? next(live) : next; }] };
      if (specifier === "@tanstack/react-query") return { useQuery: (options: ReturnType<typeof observabilityMetricsQuery>) => { queryCalls.push(options); return { ...result, refetch: async () => { retries++; } }; } };
      if (specifier === "@tanstack/react-router") return {
        createFileRoute: () => (options: any) => ({
          options, useParams: () => ({ orgSlug: routeOrg }), useSearch: () => search,
          useNavigate: () => (navigation: any) => {
            search = metricData.normalizeMetricsSearch(navigation.search);
            navigations.push({ search, resetScroll: navigation.resetScroll });
            return Promise.resolve();
          },
        }),
      };
      if (specifier.endsWith("/metrics-content")) return { MetricsContent: Content };
      if (specifier.endsWith("/metrics-data")) return metricData;
      if (specifier.endsWith("/metrics-query")) return { observabilityMetricsQuery };
      throw new Error(`Unexpected Metrics controller dependency: ${specifier}`);
    },
  });
  return {
    queryCalls, navigations,
    search: () => search, retries: () => retries,
    render() { return (module.exports.WorkspaceMetrics({ orgSlug: routeOrg }) as React.ReactElement<any>).props; },
    result(next: Partial<typeof result>) { result = { ...result, ...next }; },
    externalSearch(next: unknown) { search = metricData.normalizeMetricsSearch(next); },
    route(nextOrg: string) { routeOrg = nextOrg; return module.exports.Route.options.component() as React.ReactElement<any>; },
    validate: module.exports.Route.options.validateSearch as typeof metricData.normalizeMetricsSearch,
  };
}

test("direct metric links query their exact URL selection immediately without auto-selecting the first instrument", async () => {
  const controller = await loadController("team /?", { range: "7d", metric: "histogram /? key", service: "Payments / worker?region=eu" });
  const content = controller.render();
  assert.deepEqual(content.search, { range: "7d", metric: "histogram /? key", service: "Payments / worker?region=eu" });
  assert.deepEqual(controller.queryCalls[0].queryKey, ["observability", "metrics", "team /?", "histogram /? key", "Payments / worker?region=eu", "7d"]);
  assert.equal(controller.queryCalls.length, 1);
  assert.equal(content.loading, true);
  assert.equal(controller.navigations.length, 0);
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  controller.render();
  assert.equal(controller.navigations.length, 0, "a response must not trigger a second selection navigation");
});

test("invalid URL parameters normalize at the route boundary, preserving allowed time ranges", async () => {
  const controller = await loadController("outray-tunnel", { range: "90d", metric: [], service: {} });
  assert.deepEqual(controller.render().search, { range: "1h" });
  for (const range of metricData.METRICS_RANGES) assert.equal(controller.validate({ range }).range, range);
  assert.deepEqual(controller.validate({ range: " 24h ", metric: " key ", service: " worker " }), { range: "24h", metric: "key", service: "worker" });
});

test("range, metric and service callbacks update the URL without jumping scroll or duplicate navigation", async () => {
  const controller = await loadController();
  controller.render().onSearchChange({ range: "24h", metric: "cpu-gauge", service: "worker" });
  assert.deepEqual(controller.search(), { range: "24h", metric: "cpu-gauge", service: "worker" });
  assert.equal(controller.navigations[0].resetScroll, false);
  const content = controller.render();
  content.onSearchChange({ range: "24h", metric: "cpu-gauge", service: "worker" });
  assert.equal(controller.navigations.length, 1);
  content.onSearchChange({ range: "24h", metric: "cpu-gauge" });
  assert.equal(controller.search().service, undefined);
  controller.externalSearch({ range: "6h", metric: "memory" });
  assert.equal(controller.render().search.range, "6h", "back/forward search is the rendering source of truth");
});

test("Pause changes automatic query behavior but keeps manual retries available", async () => {
  const controller = await loadController();
  let content = controller.render();
  assert.equal(content.isLive, true);
  assert.equal(controller.queryCalls.at(-1)!.refetchInterval, 4_000);
  content.onToggleLive();
  content = controller.render();
  assert.equal(content.isLive, false);
  assert.equal(controller.queryCalls.at(-1)!.refetchInterval, false);
  assert.equal(controller.queryCalls.at(-1)!.refetchOnWindowFocus, false);
  content.onRetry();
  assert.equal(controller.retries(), 1);
  content.onToggleLive();
  assert.equal(controller.render().isLive, true);
});

test("background selections and failed refreshes retain the original snapshot and its provenance", async () => {
  const controller = await loadController();
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  controller.render().onSearchChange({ range: "7d", metric: "new-key", service: "new-service" });
  controller.result({ isFetching: true });
  const pending = controller.render();
  assert.equal(pending.data, snapshot);
  assert.equal(pending.data.requestedRange, "1h");
  assert.equal(pending.search.range, "7d");
  assert.equal(pending.loading, false);
  assert.equal(pending.isFetching, true);
  controller.result({ isFetching: false, error: new Error("Unavailable") });
  const failed = controller.render();
  assert.equal(failed.data, snapshot);
  assert.equal(failed.error, "Unavailable");
  assert.equal(failed.loading, false);
  failed.onRetry();
  assert.equal(controller.retries(), 1);
});

test("workspace controllers are keyed to organization and queries cannot reuse another tenant's data", async () => {
  const controller = await loadController("old-team");
  assert.equal(controller.route("old-team").key, "old-team");
  assert.equal(controller.route("new-team").key, "new-team");
  assert.equal(controller.route("new-team").props.orgSlug, "new-team");
  controller.render();
  const query = controller.queryCalls.at(-1)!;
  assert.equal(query.queryKey[2], "new-team");
  assert.equal(query.placeholderData!(snapshot, { queryKey: ["observability", "metrics", "old-team"] } as any, undefined as any, undefined as any), undefined);
});
