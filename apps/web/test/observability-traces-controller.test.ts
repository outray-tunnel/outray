import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as tracesData from "../src/components/observability/traces-data";
import { observabilityTracesQuery } from "../src/components/observability/traces-query";

const trace: tracesData.TraceSummary = {
  id: "trace-one", name: "POST /payments", rootService: "payments-worker",
  startedAt: "2026-10-05 12:00:00.123456", duration: 152, spanCount: 3,
  status: "error", method: "POST", spans: [],
};
const snapshot: tracesData.TracesSnapshot = {
  traces: [trace], statistics: { totalTraces: 240, errorTraces: 12, errorRate: 5, p95Duration: 400, longestDuration: 1700 },
  distribution: [{ bucket: "100-250", count: 180 }], range: "1h",
  requestedSearch: { range: "1h" }, receivedAt: Date.parse("2026-10-05T12:01:00Z"),
};

/** Exercise the real route hooks and debounce clock without a server or browser. */
async function loadController(orgSlug = "outray-tunnel", initialSearch: unknown = {}) {
  const source = await readFile(new URL("../src/routes/$orgSlug/observability/traces.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(`${source}\nexport { WorkspaceTraces };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  let routeOrg = orgSlug;
  let search = tracesData.normalizeTracesSearch(initialSearch);
  let retries = 0;
  let dirty = false;
  let result: { data?: tracesData.TracesSnapshot; isPending: boolean; isFetching: boolean; error: Error | null } = {
    data: undefined, isPending: true, isFetching: true, error: null,
  };
  const values: any[] = [];
  const refs: Array<{ current: any }> = [];
  const memoized: Array<{ deps: unknown[]; value: any }> = [];
  const activeEffects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  let effects: Array<{ callback: () => void | (() => void); deps: unknown[] }> = [];
  let stateIndex = 0; let refIndex = 0; let memoIndex = 0; let timerId = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const queryCalls: Array<ReturnType<typeof observabilityTracesQuery>> = [];
  const navigations: Array<{ search: tracesData.NormalizedTracesSearch; resetScroll: boolean; replace: boolean }> = [];
  const Content = () => null;
  const Inspector = () => null;
  const module = { exports: {} as any };
  const sameDependencies = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (callback: () => any, deps: unknown[]) => {
    const slot = memoIndex++;
    if (!memoized[slot] || !sameDependencies(memoized[slot].deps, deps)) memoized[slot] = { value: callback(), deps: deps.slice() };
    return memoized[slot].value;
  };
  const schedule = (callback: () => void, delay: number) => { timers.set(++timerId, { callback, delay }); return timerId; };
  const clear = (id: number) => { timers.delete(id); };
  const navigate = (navigation: any) => {
    search = tracesData.normalizeTracesSearch(typeof navigation.search === "function" ? navigation.search(search) : navigation.search);
    navigations.push({ search, resetScroll: navigation.resetScroll, replace: navigation.replace });
    return Promise.resolve();
  };
  runInNewContext(compiled, {
    React, module, exports: module.exports, window: { setTimeout: schedule, clearTimeout: clear }, setTimeout: schedule, clearTimeout: clear,
    require: (specifier: string) => {
      if (specifier === "react") return {
        useState: (initial: any) => {
          const slot = stateIndex++;
          if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
          return [values[slot], (next: any) => {
            const value = typeof next === "function" ? next(values[slot]) : next;
            if (!Object.is(value, values[slot])) { values[slot] = value; dirty = true; }
          }];
        },
        useRef: (initial: any) => { const slot = refIndex++; return refs[slot] ?? (refs[slot] = { current: initial }); },
        useMemo: memo,
        useCallback: (callback: any, deps: unknown[]) => memo(() => callback, deps),
        useEffect: (callback: () => void | (() => void), deps: unknown[]) => effects.push({ callback, deps }),
      };
      if (specifier === "@tanstack/react-query") return { useQuery: (options: ReturnType<typeof observabilityTracesQuery>) => {
        queryCalls.push(options); return { ...result, refetch: async () => { retries++; } };
      } };
      if (specifier === "@tanstack/react-router") return {
        createFileRoute: () => (options: any) => ({
          options, useParams: () => ({ orgSlug: routeOrg }), useSearch: () => search, useNavigate: () => navigate,
        }),
      };
      if (specifier.endsWith("/traces-content")) return { TracesContent: Content };
      if (specifier.endsWith("/traces-data")) return tracesData;
      if (specifier.endsWith("/traces-query")) return { observabilityTracesQuery };
      if (specifier.endsWith("/trace-inspector")) return { TraceInspector: Inspector };
      throw new Error(`Unexpected Traces controller dependency: ${specifier}`);
    },
  });
  function collect(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(collect);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>;
    return [element, ...collect(element.props.children)];
  }
  let latest: React.ReactElement<any>[] = [];
  function render(commit = true) {
    let passes = 0;
    do {
      assert.ok(passes++ < 20, "controller state must settle without a render loop");
      stateIndex = 0; refIndex = 0; memoIndex = 0; effects = []; dirty = false;
      latest = collect(module.exports.WorkspaceTraces({ orgSlug: routeOrg }));
      // React discards render-phase state updates before committing effects.
      if (commit && !dirty) {
        effects.forEach((effect, index) => {
          const previous = activeEffects[index];
          if (previous && sameDependencies(previous.deps, effect.deps)) return;
          previous?.cleanup?.();
          activeEffects[index] = { deps: effect.deps.slice(), cleanup: effect.callback() ?? undefined };
        });
      }
    } while (commit && dirty);
    const content = latest.find((element) => element.type === Content);
    assert.ok(content, "the route exposes TracesContent");
    return content.props;
  }
  return {
    queryCalls, navigations, timers,
    search: () => search, retries: () => retries, render,
    inspector() { return latest.find((element) => element.type === Inspector)?.props; },
    result(next: Partial<typeof result>) { result = { ...result, ...next }; },
    externalSearch(next: unknown) { search = tracesData.normalizeTracesSearch(next); },
    route(nextOrg: string) { routeOrg = nextOrg; return module.exports.Route.options.component() as React.ReactElement<any>; },
    validate: module.exports.Route.options.validateSearch as typeof tracesData.normalizeTracesSearch,
    advanceSearch() {
      const timer = [...timers].find(([, value]) => value.delay === 250);
      assert.ok(timer, "search is debounced for 250 ms");
      timers.delete(timer[0]); timer[1].callback();
    },
    unmount() { activeEffects.forEach((effect) => effect.cleanup?.()); },
  };
}

test("direct trace links query URL search, status and range without opening the first trace", async () => {
  const controller = await loadController("team /?β", { search: " payment /? ", errorsOnly: "true", range: "7d" });
  const view = controller.render();
  assert.deepEqual(view.filters, { search: "payment /?", errorsOnly: true, range: "7d" });
  assert.deepEqual(controller.queryCalls.at(-1)!.queryKey, ["observability", "traces", "team /?β", "payment /?", true, "7d"]);
  assert.equal(controller.navigations.length, 0);
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  controller.render();
  assert.equal(controller.inspector()?.trace, null);
  assert.equal(controller.navigations.length, 0);
});

test("invalid URL values normalize while all supported ranges and explicit error status survive", async () => {
  const controller = await loadController("acme", { search: [], errorsOnly: {}, range: "90d" });
  assert.deepEqual(controller.render().filters, { range: "1h" });
  for (const range of tracesData.TRACE_RANGES) assert.equal(controller.validate({ range }).range, range);
  assert.deepEqual(controller.validate({ search: " retry ", errorsOnly: true, range: " 24h " }), { search: "retry", errorsOnly: true, range: "24h" });
  assert.deepEqual(controller.validate({ errorsOnly: "false", range: "6h" }), { range: "6h" });
});

test("typing debounces once and immediate filters atomically commit the current draft to the server query", async () => {
  const controller = await loadController("acme", { range: "1h" });
  controller.render().onSearchInputChange("payment"); controller.render();
  assert.equal(controller.search().search, undefined); assert.equal(controller.timers.size, 1);
  controller.render().onSearchInputChange("payment retry"); controller.render();
  assert.equal(controller.timers.size, 1, "a new draft cancels the prior timer");
  controller.render().onFiltersChange({ errorsOnly: true, range: "24h" });
  controller.render();
  assert.deepEqual(controller.search(), { search: "payment retry", errorsOnly: true, range: "24h" });
  assert.equal(controller.navigations.at(-1)?.resetScroll, false);
  assert.equal(controller.timers.size, 0, "status changes must not leave a stale search navigation queued");
  assert.deepEqual(controller.queryCalls.at(-1)!.queryKey, ["observability", "traces", "acme", "payment retry", true, "24h"]);
  controller.render().onSearchInputChange("payment failure"); controller.render(); controller.advanceSearch(); controller.render();
  assert.deepEqual(controller.search(), { search: "payment failure", errorsOnly: true, range: "24h" });
  assert.equal(controller.navigations.at(-1)?.replace, true);
  controller.unmount();
});

test("Back and Forward restore URL search and cancel pending text without rewriting history", async () => {
  const controller = await loadController("acme", { search: "initial", range: "1h" });
  controller.render().onSearchInputChange("uncommitted"); controller.render();
  assert.equal(controller.timers.size, 1);
  controller.externalSearch({ search: "back navigation", errorsOnly: true, range: "7d" });
  const restored = controller.render();
  assert.equal(restored.searchInput, "back navigation"); assert.equal(controller.timers.size, 0);
  assert.equal(controller.navigations.length, 0);
  assert.deepEqual(restored.filters, { search: "back navigation", errorsOnly: true, range: "7d" });
  controller.render().onSearchInputChange("another draft"); controller.render(); controller.unmount();
  assert.equal(controller.timers.size, 0);
});

test("clear filters preserves duration and avoids redundant navigation", async () => {
  const controller = await loadController("acme", { search: "payment", errorsOnly: true, range: "7d" });
  controller.render().onSearchInputChange("pending draft"); controller.render();
  controller.render().onClearFilters();
  const clear = controller.render();
  assert.deepEqual(controller.search(), { range: "7d" });
  assert.equal(clear.searchInput, ""); assert.equal(controller.timers.size, 0);
  const count = controller.navigations.length;
  clear.onFiltersChange({ range: "7d" }); assert.equal(controller.navigations.length, count);
  controller.unmount();
});

test("Pause disables automatic polling, focus and reconnect while manual retries remain available", async () => {
  const controller = await loadController();
  let content = controller.render();
  assert.equal(content.isLive, true); assert.equal(controller.queryCalls.at(-1)!.refetchInterval, 4_000);
  content.onToggleLive(); content = controller.render();
  assert.equal(content.isLive, false); assert.equal(controller.queryCalls.at(-1)!.refetchInterval, false);
  assert.equal(controller.queryCalls.at(-1)!.refetchOnWindowFocus, false);
  assert.equal(controller.queryCalls.at(-1)!.refetchOnReconnect, false);
  content.onRetry(); assert.equal(controller.retries(), 1);
  content.onToggleLive(); assert.equal(controller.render().isLive, true);
});

test("pending selections and failed refresh retain displayed snapshots and truthful provenance", async () => {
  const controller = await loadController();
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  controller.render().onFiltersChange({ range: "7d", search: "new-route", errorsOnly: true });
  controller.result({ isFetching: true });
  const pending = controller.render();
  assert.equal(pending.data, snapshot); assert.equal(pending.data.requestedSearch.range, "1h");
  assert.equal(pending.filters.range, "7d"); assert.equal(pending.loading, false); assert.equal(pending.isFetching, true);
  controller.result({ isFetching: false, error: new Error("Unavailable") });
  const failed = controller.render();
  assert.equal(failed.data, snapshot); assert.equal(failed.error, "Unavailable"); assert.equal(failed.loading, false);
  failed.onRetry(); assert.equal(controller.retries(), 1);
});

test("a failed new-filter request preserves prior evidence even when React Query drops its placeholder", async () => {
  const controller = await loadController();
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  assert.equal(controller.render().data, snapshot);
  controller.render().onFiltersChange({ range: "7d", search: "new-route", errorsOnly: true });
  controller.result({ data: undefined, isPending: false, isFetching: false, error: new Error("Unavailable") });
  const failed = controller.render();
  assert.equal(failed.data, snapshot);
  assert.equal(failed.data.requestedSearch.range, "1h");
  assert.deepEqual(failed.filters, { search: "new-route", errorsOnly: true, range: "7d" });
  assert.equal(failed.loading, false); assert.equal(failed.error, "Unavailable");
  failed.onRetry(); assert.equal(controller.retries(), 1);

  const replacement: tracesData.TracesSnapshot = {
    ...snapshot, traces: [{ ...trace, id: "new-trace" }], range: "7d",
    requestedSearch: { search: "new-route", errorsOnly: true, range: "7d" },
  };
  controller.result({ data: replacement, error: null });
  const refreshed = controller.render();
  assert.equal(refreshed.data, replacement);
  assert.deepEqual(refreshed.data.requestedSearch, refreshed.filters);
  assert.equal(refreshed.error, null);
});

test("initial failure without prior evidence stays an explicit unavailable state", async () => {
  const controller = await loadController("acme", { range: "7d", errorsOnly: true });
  controller.result({ data: undefined, isPending: false, isFetching: false, error: new Error("Unavailable") });
  const failed = controller.render();
  assert.equal(failed.data, undefined); assert.equal(failed.error, "Unavailable");
  assert.equal(failed.loading, false);
});

test("inspection freezes the clicked summary instead of jumping when a live response changes or ages it out", async () => {
  const controller = await loadController();
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  const button = { isConnected: true, focus() {} };
  controller.render().onInspect(trace, button); controller.render();
  assert.equal(controller.inspector()?.trace, trace); assert.equal(controller.inspector()?.returnFocusRef.current, button);
  controller.result({ data: { ...snapshot, traces: [{ ...trace, name: "Changed record" }] } });
  controller.render(); assert.equal(controller.inspector()?.trace, trace);
  controller.result({ data: { ...snapshot, traces: [{ ...trace, id: "second" }] } });
  controller.render(); assert.equal(controller.inspector()?.trace, trace);
  controller.inspector()!.onClose(); controller.render(); assert.equal(controller.inspector()?.trace, null);
});

test("inspecting retained evidence keeps its loaded range for related logs despite a newer requested range", async () => {
  const controller = await loadController("acme", { range: "7d" });
  const prior = { ...snapshot, range: "7d", requestedSearch: { range: "7d" as const } };
  controller.result({ data: prior, isPending: false, isFetching: false });
  controller.render().onFiltersChange({ range: "1h" });
  controller.result({ data: undefined, error: new Error("Unavailable") });
  const failed = controller.render();
  assert.equal(failed.filters.range, "1h"); assert.equal(failed.data, prior);
  failed.onInspect(trace, { isConnected: true, focus() {} }); controller.render();
  assert.equal(controller.inspector()?.trace, trace);
  assert.equal(controller.inspector()?.range, "7d", "related logs must use the clicked evidence's original period");
  controller.result({ data: { ...snapshot, traces: [{ ...trace, name: "newer trace data" }] }, error: null });
  controller.render();
  assert.equal(controller.inspector()?.trace, trace);
  assert.equal(controller.inspector()?.range, "7d", "a live response cannot change the frozen inspector's link scope");
});

test("closing an aged-out trace restores stable search focus rather than a detached row", async () => {
  const controller = await loadController();
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  const content = controller.render();
  const searchInput = { isConnected: true, focus() {} };
  content.searchRef.current = searchInput;
  const trigger = { isConnected: true, focus() {} };
  content.onInspect(trace, trigger); controller.render(); trigger.isConnected = false;
  controller.inspector()!.onClose(); controller.render();
  assert.equal(controller.inspector()?.returnFocusRef.current, searchInput);
  assert.equal(controller.inspector()?.trace, null);
});

test("filter changes hide inspection before effects and do not reopen it on Back", async () => {
  const controller = await loadController();
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  const searchInput = { isConnected: true, focus() {} };
  controller.render().searchRef.current = searchInput;
  const trigger = { isConnected: true, focus() {} };
  controller.render().onInspect(trace, trigger); controller.render(); trigger.isConnected = false;
  controller.externalSearch({ range: "7d", errorsOnly: true, search: "failure" });
  controller.render(false); assert.equal(controller.inspector()?.trace, null, "old filter details cannot flash before effects run");
  controller.render();
  assert.equal(controller.inspector()?.returnFocusRef.current, searchInput);
  controller.externalSearch({ range: "1h" }); controller.render();
  assert.equal(controller.inspector()?.trace, null, "Back restores the list, not a stale selection");
});

test("workspace controllers remount and queries cannot reuse another tenant's traces", async () => {
  const controller = await loadController("old-team");
  assert.equal(controller.route("old-team").key, "old-team");
  assert.equal(controller.route("new-team").key, "new-team");
  assert.equal(controller.route("new-team").props.orgSlug, "new-team");
  controller.render();
  const query = controller.queryCalls.at(-1)!;
  assert.equal(query.queryKey[2], "new-team");
  assert.equal(query.placeholderData!(snapshot, { queryKey: ["observability", "traces", "old-team"] } as any, undefined as any, undefined as any), undefined);
});
