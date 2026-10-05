import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as logsData from "../src/components/observability/logs-data";
import { observabilityLogsQuery } from "../src/components/observability/logs-query";

const event: logsData.LogEvent = {
  id: "event-one", timestamp: "2026-10-05 12:00:00.123456", observedTimestamp: "2026-10-05 12:00:01",
  level: "warn", severityNumber: 13, severityText: "WARN", message: "Payment retry scheduled",
  eventName: "payment.retry", traceId: "trace-one", spanId: "span-one", flags: 0,
  service: "payments-worker", serviceNamespace: "byteship", serviceVersion: "v2", environment: "production",
  region: "eu-west", scopeName: "@outray/sdk", scopeVersion: "1.0.0", attributes: { attempts: 0 },
  resourceAttributes: {}, scopeAttributes: {},
};
const snapshot: logsData.LogsSnapshot = {
  logs: [event], services: [event.service], range: "1h", requestedSearch: { range: "1h" },
  receivedAt: Date.parse("2026-10-05T12:01:00Z"),
};

/** Runs the real route's hooks, effects and debounce clock, without a server. */
async function loadController(orgSlug = "outray-tunnel", initialSearch: unknown = {}) {
  const source = await readFile(new URL("../src/routes/$orgSlug/observability/logs.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(`${source}\nexport { WorkspaceLogs };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  let routeOrg = orgSlug;
  let search = logsData.normalizeLogsSearch(initialSearch);
  let retries = 0;
  let dirty = false;
  let result: { data?: logsData.LogsSnapshot; isPending: boolean; isFetching: boolean; error: Error | null } = {
    data: undefined, isPending: true, isFetching: true, error: null,
  };
  const values: any[] = [];
  const refs: Array<{ current: any }> = [];
  const memoized: Array<{ deps: unknown[]; value: any }> = [];
  const activeEffects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  let effects: Array<{ callback: () => void | (() => void); deps: unknown[] }> = [];
  let stateIndex = 0; let refIndex = 0; let memoIndex = 0; let timerId = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const queryCalls: Array<ReturnType<typeof observabilityLogsQuery>> = [];
  const navigations: Array<{ search: logsData.LogsSearch; resetScroll: boolean; replace: boolean }> = [];
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
    search = logsData.normalizeLogsSearch(typeof navigation.search === "function" ? navigation.search(search) : navigation.search);
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
      if (specifier === "@tanstack/react-query") return { useQuery: (options: ReturnType<typeof observabilityLogsQuery>) => {
        queryCalls.push(options); return { ...result, refetch: async () => { retries++; } };
      } };
      if (specifier === "@tanstack/react-router") return {
        createFileRoute: () => (options: any) => ({
          options, useParams: () => ({ orgSlug: routeOrg }), useSearch: () => search, useNavigate: () => navigate,
        }),
      };
      if (specifier.endsWith("/logs-content")) return { LogsContent: Content };
      if (specifier.endsWith("/logs-data")) return logsData;
      if (specifier.endsWith("/logs-query")) return { observabilityLogsQuery };
      if (specifier.endsWith("/log-inspector")) return { LogInspector: Inspector };
      throw new Error(`Unexpected Logs controller dependency: ${specifier}`);
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
      assert.ok(passes++ < 20, "controller effects must settle without a render loop");
      stateIndex = 0; refIndex = 0; memoIndex = 0; effects = []; dirty = false;
      latest = collect(module.exports.WorkspaceLogs({ orgSlug: routeOrg }));
      if (commit) {
        effects.forEach((effect, index) => {
          const previous = activeEffects[index];
          if (previous && sameDependencies(previous.deps, effect.deps)) return;
          previous?.cleanup?.();
          activeEffects[index] = { deps: effect.deps.slice(), cleanup: effect.callback() ?? undefined };
        });
      }
    } while (commit && dirty);
    const content = latest.find((element) => element.type === Content);
    assert.ok(content, "the route exposes the shared LogsContent view");
    return content.props;
  }
  return {
    queryCalls, navigations, timers,
    search: () => search, retries: () => retries,
    render,
    inspector() { return latest.find((element) => element.type === Inspector)?.props; },
    result(next: Partial<typeof result>) { result = { ...result, ...next }; },
    externalSearch(next: unknown) { search = logsData.normalizeLogsSearch(next); },
    route(nextOrg: string) { routeOrg = nextOrg; return module.exports.Route.options.component() as React.ReactElement<any>; },
    validate: module.exports.Route.options.validateSearch as typeof logsData.normalizeLogsSearch,
    advanceSearch() {
      const timer = [...timers].find(([, value]) => value.delay === 250);
      assert.ok(timer, "search is debounced for 250 ms");
      timers.delete(timer[0]); timer[1].callback();
    },
    unmount() { activeEffects.forEach((effect) => effect.cleanup?.()); },
  };
}

test("direct log links use the complete URL selection without opening the first log", async () => {
  const controller = await loadController("team /?β", { search: " payment ", service: "Payments / worker?region=eu", level: "warn", range: "7d" });
  const view = controller.render();
  assert.deepEqual(view.filters, { search: "payment", service: "Payments / worker?region=eu", level: "warn", range: "7d" });
  assert.deepEqual(controller.queryCalls.at(-1)!.queryKey, ["observability", "logs", "team /?β", "payment", "Payments / worker?region=eu", "warn", "7d"]);
  assert.equal(controller.navigations.length, 0);
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  controller.render();
  assert.equal(controller.inspector()?.event, null);
  assert.equal(controller.navigations.length, 0);
});

test("invalid links normalize at the route boundary without confusing an actual service called all", async () => {
  const controller = await loadController("acme", { search: [], service: {}, level: "critical", range: "90d" });
  assert.deepEqual(controller.render().filters, { range: "1h" });
  for (const range of logsData.LOG_RANGES) assert.equal(controller.validate({ range }).range, range);
  assert.deepEqual(controller.validate({ search: " retry ", service: " all ", level: " warn ", range: " 24h " }), { search: "retry", service: "all", level: "warn", range: "24h" });
});

test("search debounces once and immediate filter changes preserve the current unsaved search draft", async () => {
  const controller = await loadController("acme", { range: "1h", service: "api" });
  let content = controller.render();
  content.onSearchInputChange("payment");
  content = controller.render();
  assert.equal(controller.search().search, undefined);
  assert.equal(controller.timers.size, 1);
  content.onSearchInputChange("payment retry");
  content = controller.render();
  assert.equal(controller.timers.size, 1, "new input cancels the previous debounce");
  content.onFiltersChange({ level: "warn", range: "24h" });
  content = controller.render();
  assert.deepEqual(controller.search(), { search: "payment retry", service: "api", level: "warn", range: "24h" });
  assert.equal(controller.navigations.at(-1)?.resetScroll, false);
  assert.equal(controller.timers.size, 0, "an immediate filter commit cancels stale search navigation");
  content.onSearchInputChange("payment failure"); controller.render(); controller.advanceSearch(); controller.render();
  assert.deepEqual(controller.search(), { search: "payment failure", service: "api", level: "warn", range: "24h" });
  assert.equal(controller.navigations.at(-1)?.replace, true, "typing should not flood browser history");
  controller.unmount();
});

test("back and forward restore the input and cancel a pending draft instead of navigating back over history", async () => {
  const controller = await loadController("acme", { search: "initial", range: "1h" });
  controller.render().onSearchInputChange("uncommitted"); controller.render();
  assert.equal(controller.timers.size, 1);
  controller.externalSearch({ search: "back navigation", service: "worker", range: "7d" });
  const restored = controller.render();
  assert.equal(restored.searchInput, "back navigation");
  assert.equal(controller.timers.size, 0);
  assert.equal(controller.navigations.length, 0);
  assert.deepEqual(restored.filters, { search: "back navigation", service: "worker", range: "7d" });
  controller.render().onSearchInputChange("another draft"); controller.render(); controller.unmount();
  assert.equal(controller.timers.size, 0);
});

test("clear filters removes query, severity and service while keeping the range and avoiding redundant navigation", async () => {
  const controller = await loadController("acme", { search: "payment", service: "worker", level: "warn", range: "7d" });
  controller.render().onSearchInputChange("pending draft"); controller.render();
  controller.render().onClearFilters();
  const clear = controller.render();
  assert.deepEqual(controller.search(), { range: "7d" });
  assert.equal(clear.searchInput, ""); assert.equal(controller.timers.size, 0);
  const count = controller.navigations.length;
  clear.onFiltersChange({ range: "7d" });
  assert.equal(controller.navigations.length, count);
  controller.unmount();
});

test("Pause stops automatic work but leaves explicit retries available", async () => {
  const controller = await loadController();
  let content = controller.render();
  assert.equal(content.isLive, true);
  assert.equal(controller.queryCalls.at(-1)!.refetchInterval, 4_000);
  content.onToggleLive(); content = controller.render();
  assert.equal(content.isLive, false);
  assert.equal(controller.queryCalls.at(-1)!.refetchInterval, false);
  assert.equal(controller.queryCalls.at(-1)!.refetchOnWindowFocus, false);
  assert.equal(controller.queryCalls.at(-1)!.refetchOnReconnect, false);
  content.onRetry(); assert.equal(controller.retries(), 1);
  content.onToggleLive(); assert.equal(controller.render().isLive, true);
});

test("refreshes retain their original snapshot and provenance while failed refreshes remain retryable", async () => {
  const controller = await loadController();
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  controller.render().onFiltersChange({ range: "7d", service: "new-worker" });
  controller.result({ isFetching: true });
  const pending = controller.render();
  assert.equal(pending.data, snapshot); assert.equal(pending.data.requestedSearch.range, "1h");
  assert.equal(pending.filters.range, "7d"); assert.equal(pending.loading, false); assert.equal(pending.isFetching, true);
  controller.result({ isFetching: false, error: new Error("Unavailable") });
  const failed = controller.render();
  assert.equal(failed.data, snapshot); assert.equal(failed.error, "Unavailable"); assert.equal(failed.loading, false);
  failed.onRetry(); assert.equal(controller.retries(), 1);
});

test("opening a log keeps that snapshot and focus origin when refreshed or aged out", async () => {
  const controller = await loadController();
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  const button = { isConnected: true, focus() {} };
  controller.render().onInspect(event, button);
  controller.render();
  assert.equal(controller.inspector()?.event, event);
  assert.equal(controller.inspector()?.returnFocusRef.current, button);
  controller.result({ data: { ...snapshot, logs: [{ ...event, message: "Changed record" }] } });
  controller.render(); assert.equal(controller.inspector()?.event, event);
  controller.result({ data: { ...snapshot, logs: [{ ...event, id: "second" }] } });
  controller.render(); assert.equal(controller.inspector()?.event, event);
  controller.inspector()!.onClose(); controller.render();
  assert.equal(controller.inspector()?.event, null);
});

test("closing after the origin disappears returns focus to search instead of a detached row", async () => {
  const controller = await loadController();
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  const content = controller.render();
  const search = { isConnected: true, focus() {} };
  content.searchRef.current = search;
  const trigger = { isConnected: true, focus() {} };
  content.onInspect(event, trigger); controller.render();
  assert.equal(controller.inspector()?.returnFocusRef.current, trigger);
  trigger.isConnected = false;
  controller.inspector()!.onClose(); controller.render();
  assert.equal(controller.inspector()?.returnFocusRef.current, search);
  assert.equal(controller.inspector()?.event, null);
});

test("automatic URL filter changes close an aged-out log and restore the stable search focus target", async () => {
  const controller = await loadController();
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  const content = controller.render();
  const search = { isConnected: true, focus() {} };
  content.searchRef.current = search;
  const trigger = { isConnected: true, focus() {} };
  content.onInspect(event, trigger); controller.render();
  controller.result({ data: { ...snapshot, logs: [] } });
  trigger.isConnected = false;
  controller.render();
  assert.equal(controller.inspector()?.event, event, "an aged-out row keeps its frozen inspection until the filter changes");
  controller.externalSearch({ range: "7d", level: "error", search: "failure" });
  const destination = controller.render();
  assert.equal(controller.inspector()?.event, null);
  assert.equal(controller.inspector()?.returnFocusRef.current, search);
  assert.equal(destination.searchInput, "failure");
  assert.equal(controller.navigations.length, 0);
});

test("filter and workspace changes close inspection immediately and cannot retain another tenant's data", async () => {
  const controller = await loadController("old-team");
  controller.result({ data: snapshot, isPending: false, isFetching: false });
  controller.render().onInspect(event, { focus() {} }); controller.render();
  controller.externalSearch({ range: "7d", level: "error" });
  controller.render(false);
  assert.equal(controller.inspector()?.event, null, "filter changes must not flash the prior inspector before effects");
  controller.render();
  assert.equal(controller.route("old-team").key, "old-team");
  assert.equal(controller.route("new-team").key, "new-team");
  assert.equal(controller.route("new-team").props.orgSlug, "new-team");
  controller.render();
  const query = controller.queryCalls.at(-1)!;
  assert.equal(query.queryKey[2], "new-team");
  assert.equal(query.placeholderData!(snapshot, { queryKey: ["observability", "logs", "old-team"] } as any, undefined as any, undefined as any), undefined);
});
