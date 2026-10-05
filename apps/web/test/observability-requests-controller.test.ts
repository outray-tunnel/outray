import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import type { HttpRequestSummary, RequestsResponse } from "../src/components/observability/http-requests-data";
import * as requestsSearch from "../src/components/observability/http-requests-search";

const request: HttpRequestSummary = {
  id: "one", requestId: "request-one", timestamp: "2026-10-05T12:00:00Z", method: "POST", route: "/checkout", path: "/checkout",
  service: "api", environment: "production", region: "eu-west", statusCode: 201, duration: 120,
  traceId: "trace-one", spanId: "span-one", captureState: "full", requestSize: 256, responseSize: 1024,
};
const data: RequestsResponse = {
  requests: [request], statistics: { totalRequests: 125, errorCount: 5, errorRate: 4, p95Duration: 120, payloadCaptureCount: 80, metadataCount: 45 },
  services: ["api", "worker"], methods: ["GET", "POST"], total: 125, hasMore: true,
  nextCursor: { timestamp: "2026-10-05 12:00:00.123456", traceId: "trace /?", spanId: "span /?" }, limit: 50, range: "1h",
};
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Run real route callbacks and dependency-based effects with no server or network. */
async function loadController(orgSlug = "acme", fetchData: () => Promise<RequestsResponse> = async () => data, initialSearch: Record<string, unknown> = {}) {
  const source = await readFile(new URL("../src/routes/$orgSlug/observability/requests.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(`${source}\nexport { OrganizationHttpRequestsView };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const states: any[] = [];
  const refs: Array<{ current: any }> = [];
  const effects: Array<{ callback: () => void | (() => void); deps: unknown[] }> = [];
  const activeEffects: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const calls: Array<{ url: string; signal: AbortSignal }> = [];
  const navigations: Array<{ search: requestsSearch.HttpRequestsSearch; replace: boolean; resetScroll: boolean }> = [];
  let stateIndex = 0;
  let refIndex = 0;
  let timerId = 0;
  let routeOrg = orgSlug;
  let routeSearch = requestsSearch.parseHttpRequestsSearch(initialSearch);
  let rendering = false;
  let changedDuringRender = false;
  const navigate = (options: any) => {
    routeSearch = requestsSearch.parseHttpRequestsSearch(typeof options.search === "function" ? options.search(routeSearch) : options.search);
    navigations.push({ search: routeSearch, replace: options.replace, resetScroll: options.resetScroll });
    return Promise.resolve();
  };
  const Content = () => null;
  const Inspector = () => null;
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, module, exports: module.exports, AbortController, DOMException, URLSearchParams, Date,
    fetch: async (url: string, options: { signal: AbortSignal }) => {
      calls.push({ url, signal: options.signal });
      const response = await fetchData();
      return { ok: true, json: async () => response };
    },
    window: {
      setTimeout: (callback: () => void, delay: number) => { timers.set(++timerId, { callback, delay }); return timerId; },
      clearTimeout: (id: number) => { timers.delete(id); },
    },
    require: (specifier: string) => {
      if (specifier === "react") return {
        useState: (initial: any) => {
          const slot = stateIndex++;
          if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
          return [states[slot], (next: any) => {
            const value = typeof next === "function" ? next(states[slot]) : next;
            if (rendering && !Object.is(states[slot], value)) changedDuringRender = true;
            states[slot] = value;
          }];
        },
        useRef: (initial: any) => { const slot = refIndex++; return refs[slot] ?? (refs[slot] = { current: initial }); },
        useEffect: (callback: () => void | (() => void), deps: unknown[]) => effects.push({ callback, deps }),
        useCallback: (callback: (...args: any[]) => any) => callback,
      };
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (options: any) => ({ options, useParams: () => ({ orgSlug: routeOrg }), useSearch: () => routeSearch, useNavigate: () => navigate }) };
      if (specifier.endsWith("/http-requests-content")) return { HttpRequestsContent: Content };
      if (specifier.endsWith("/http-request-inspector")) return { HttpRequestInspector: Inspector };
      if (specifier.endsWith("/http-requests-search")) return requestsSearch;
      throw new Error(`Unexpected controller dependency: ${specifier}`);
    },
  });
  return {
    calls, timers, navigations,
    search: () => routeSearch,
    navigateExternal(search: Record<string, unknown>) { routeSearch = requestsSearch.parseHttpRequestsSearch(search); },
    render() {
      let tree: React.ReactElement<any>;
      do {
        stateIndex = 0; refIndex = 0; effects.length = 0;
        changedDuringRender = false; rendering = true;
        tree = module.exports.OrganizationHttpRequestsView({ orgSlug }) as React.ReactElement<any>;
        rendering = false;
      } while (changedDuringRender);
      const children = React.Children.toArray(tree.props.children) as React.ReactElement<any>[];
      return { content: children.find((element) => element.type === Content)!.props, inspector: children.find((element) => element.type === Inspector)! };
    },
    commit() {
      for (const [index, effect] of effects.entries()) {
        const previous = activeEffects[index];
        if (previous && effect.deps.length === previous.deps.length && effect.deps.every((value, slot) => Object.is(value, previous.deps[slot]))) continue;
        previous?.cleanup?.();
        activeEffects[index] = { deps: effect.deps.slice(), cleanup: effect.callback() ?? undefined };
      }
    },
    fireTimer(delay: number) {
      const timer = [...timers].find(([, entry]) => entry.delay === delay);
      assert.ok(timer, `${delay}ms timer exists`);
      timers.delete(timer[0]); timer[1].callback();
    },
    route(nextOrg: string) {
      routeOrg = nextOrg;
      return module.exports.Route.options.component() as React.ReactElement<any>;
    },
    unmount() { activeEffects.forEach((effect) => effect.cleanup?.()); },
  };
}

test("clearing an uncommitted search while paused cancels debounce and reloads default filters", async () => {
  const controller = await loadController();
  controller.render(); controller.commit(); await flush();
  controller.render().content.onToggleLive();
  controller.render(); controller.commit(); await flush();
  assert.equal(controller.render().content.live, false);
  assert.equal(controller.timers.size, 0, "paused mode has no poll timer");
  controller.render().content.onSearchChange("uncommitted search");
  const beforeClear = controller.render().content;
  controller.commit();
  assert.equal(beforeClear.search, "uncommitted search");
  assert.equal(beforeClear.refreshing, true);
  assert.ok([...controller.timers.values()].some((timer) => timer.delay === 300));
  const previousCalls = controller.calls.length;
  beforeClear.onResetFilters();
  const cleared = controller.render().content;
  controller.commit();
  assert.equal(controller.calls.length, previousCalls + 1, "unchanged committed query still triggers a new fetch");
  assert.equal(controller.calls.at(-2)?.signal.aborted, true);
  assert.equal(controller.timers.size, 0, "the uncommitted search cannot fire after reset");
  assert.equal(cleared.search, "");
  assert.equal(cleared.data, null);
  assert.equal(cleared.loading, true);
  assert.equal(cleared.service, "");
  for (const field of ["method", "status", "capture"]) assert.equal(cleared[field], "all");
  assert.equal(new URL(controller.calls.at(-1)!.url, "https://test.invalid").searchParams.has("search"), false);
  await flush();
  const loaded = controller.render().content;
  assert.equal(loaded.data, data);
  assert.equal(loaded.loading, false);
  assert.equal(loaded.search, "");
  assert.equal(loaded.live, false);
  assert.equal(controller.timers.size, 0);
  controller.unmount();
});

test("filters, cached facets and pagination retain the existing encoded request transport", async () => {
  const controller = await loadController("team /?");
  let content = controller.render().content;
  controller.commit(); await flush();
  content = controller.render().content;
  content.onServiceChange("worker"); content.onMethodChange("GET"); content.onStatusChange("errors"); content.onCaptureChange("redacted"); content.onRangeChange("7d"); content.onSearchChange("  /orders?customer=one  ");
  controller.render(); controller.commit(); await flush();
  controller.fireTimer(300);
  controller.render(); controller.commit(); await flush();
  const filtered = new URL(controller.calls.at(-1)!.url, "https://test.invalid");
  assert.equal(filtered.pathname, "/api/team%20%2F%3F/observability/requests");
  assert.deepEqual(Object.fromEntries(filtered.searchParams), { range: "7d", limit: "50", search: "/orders?customer=one", service: "worker", method: "GET", status: "errors", capture: "redacted", include_facets: "false" });
  content = controller.render().content;
  content.onNextPage();
  const nextPage = controller.render().content;
  assert.equal(nextPage.page, 1);
  assert.equal(nextPage.total, 125, "cursor changes keep the previously known total");
  controller.commit(); await flush();
  const paged = new URL(controller.calls.at(-1)!.url, "https://test.invalid");
  assert.equal(paged.searchParams.get("before_timestamp"), data.nextCursor!.timestamp);
  assert.equal(paged.searchParams.get("before_trace_id"), data.nextCursor!.traceId);
  assert.equal(paged.searchParams.get("before_span_id"), data.nextCursor!.spanId);
  assert.equal(paged.searchParams.get("include_facets"), "false");
  controller.render().content.onPreviousPage();
  controller.render(); controller.commit(); await flush();
  assert.equal(new URL(controller.calls.at(-1)!.url, "https://test.invalid").searchParams.has("before_timestamp"), false);
  assert.equal(controller.render().content.page, 0);
  controller.unmount();
});

test("organization controllers are keyed and cleanup aborts and ignores an old pending response", async () => {
  let resolve!: (value: RequestsResponse) => void;
  const pending = new Promise<RequestsResponse>((done) => { resolve = done; });
  const controller = await loadController("old-team", () => pending);
  assert.equal(controller.route("old-team").key, "old-team");
  assert.equal(controller.route("new-team").key, "new-team");
  assert.equal(controller.route("new-team").props.orgSlug, "new-team");
  controller.render(); controller.commit();
  assert.equal(controller.calls.length, 1);
  controller.unmount();
  assert.equal(controller.calls[0].signal.aborted, true);
  resolve(data); await flush();
  assert.equal(controller.render().content.data, null, "an old scope cannot publish its late response");
  assert.equal(controller.timers.size, 0, "a disposed scope cannot restart live polling");
});

test("inspector close clears selection but keeps its component mounted for focus restoration", async () => {
  const controller = await loadController();
  const trigger = { focus() {} };
  controller.render().content.onInspect(request, trigger);
  let rendered = controller.render();
  assert.equal(rendered.inspector.props.request, request);
  assert.equal(rendered.inspector.props.returnFocusRef.current, trigger);
  const key = rendered.inspector.key;
  rendered.inspector.props.onClose();
  rendered = controller.render();
  assert.equal(rendered.inspector.props.request, null);
  assert.equal(rendered.inspector.key, key, "closing does not remount the inspector before its exit completes");
  assert.equal(rendered.inspector.props.returnFocusRef.current, trigger);
});

test("shared filter URLs apply every validated field to the first request, without an unfiltered fetch", async () => {
  const canonicalService = "Byteship / API?name=a&literal=%2F+β";
  for (const range of ["1h", "6h", "24h", "7d", "30d"]) {
    const controller = await loadController("team /?", async () => data, {
      service: canonicalService, range, search: "  /orders?customer=one  ", method: "PROPFIND", status: "errors", capture: "redacted",
    });
    const content = controller.render().content;
    assert.equal(content.service, canonicalService);
    assert.equal(content.range, range);
    assert.equal(content.search, "/orders?customer=one");
    controller.commit(); await flush();
    assert.equal(controller.calls.length, 1);
    const first = new URL(controller.calls[0].url, "https://test.invalid");
    assert.equal(first.pathname, "/api/team%20%2F%3F/observability/requests");
    assert.deepEqual(Object.fromEntries(first.searchParams), {
      range, limit: "50", search: "/orders?customer=one", service: canonicalService, method: "PROPFIND", status: "errors", capture: "redacted",
    });
    controller.unmount();
  }
});

test("invalid URL values use safe defaults, and the literal service named all remains filterable", async () => {
  const invalid = await loadController("acme", async () => data, { service: ["api"], search: {}, method: "GET\nPOST", status: "503", capture: "password", range: "90d" });
  const content = invalid.render().content;
  assert.equal(content.service, "");
  assert.equal(content.range, "1h");
  assert.equal(content.search, "");
  for (const field of ["method", "status", "capture"]) assert.equal(content[field], "all");
  invalid.commit(); await flush();
  assert.deepEqual(Object.fromEntries(new URL(invalid.calls[0].url, "https://test.invalid").searchParams), { range: "1h", limit: "50" });
  invalid.unmount();
  const literal = await loadController("acme", async () => data, { service: "all", range: "6h" });
  assert.equal(literal.render().content.service, "all");
  literal.commit(); await flush();
  assert.equal(new URL(literal.calls[0].url, "https://test.invalid").searchParams.get("service"), "all");
  literal.render().content.onServiceChange("");
  literal.render(); literal.commit(); await flush();
  assert.deepEqual(literal.search(), { range: "6h" });
  assert.equal(new URL(literal.calls.at(-1)!.url, "https://test.invalid").searchParams.has("service"), false);
  literal.unmount();
});

test("debounced search merges the latest menu selections instead of overwriting concurrent URL changes", async () => {
  const controller = await loadController("acme", async () => data, { search: "checkout", service: "api", range: "24h" });
  controller.render(); controller.commit(); await flush();
  let content = controller.render().content;
  content.onToggleLive();
  controller.render(); controller.commit(); await flush();
  content = controller.render().content;
  content.onSearchChange("  orders  ");
  controller.render(); controller.commit();
  const beforeMenus = controller.calls.length;
  content.onServiceChange("Worker / regional");
  content.onMethodChange("M-SEARCH");
  content.onStatusChange("success");
  content.onCaptureChange("full");
  content.onRangeChange("7d");
  controller.render(); controller.commit(); await flush();
  assert.equal(controller.calls.length, beforeMenus + 1);
  assert.equal(controller.render().content.search, "  orders  ", "menu navigation retains the draft until its debounce commits");
  assert.equal(controller.search().search, "checkout");
  controller.fireTimer(300);
  controller.render(); controller.commit(); await flush();
  const expected = { search: "orders", service: "Worker / regional", method: "M-SEARCH", status: "success", capture: "full", range: "7d" };
  assert.deepEqual(controller.search(), expected);
  const requestParams = new URL(controller.calls.at(-1)!.url, "https://test.invalid").searchParams;
  for (const [key, value] of Object.entries(expected)) assert.equal(requestParams.get(key), value);
  assert.equal(controller.render().content.live, false);
  assert.equal(controller.timers.size, 0);
  for (const navigation of controller.navigations) {
    assert.equal(navigation.replace, true);
    assert.equal(navigation.resetScroll, false);
  }
  const restored = await loadController("acme", async () => data, controller.search());
  restored.render(); restored.commit(); await flush();
  const restoredParams = new URL(restored.calls[0].url, "https://test.invalid").searchParams;
  for (const [key, value] of Object.entries(expected)) assert.equal(restoredParams.get(key), value);
  controller.unmount(); restored.unmount();
});

test("clearing service preserves other filters, while Clear filters preserves only the chosen range and pause", async () => {
  const controller = await loadController("acme", async () => data, { search: "checkout", service: "api", method: "PATCH", status: "errors", capture: "metadata", range: "30d" });
  controller.render(); controller.commit(); await flush();
  controller.render().content.onToggleLive();
  controller.render(); controller.commit(); await flush();
  controller.render().content.onServiceChange("");
  controller.render(); controller.commit(); await flush();
  assert.deepEqual(controller.search(), { search: "checkout", method: "PATCH", status: "errors", capture: "metadata", range: "30d" });
  controller.render().content.onResetFilters();
  controller.render(); controller.commit(); await flush();
  assert.deepEqual(controller.search(), { range: "30d" });
  const cleared = controller.render().content;
  assert.equal(cleared.search, "");
  assert.equal(cleared.service, "");
  assert.equal(cleared.range, "30d");
  assert.equal(cleared.live, false);
  assert.equal(cleared.page, 0);
  for (const field of ["method", "status", "capture"]) assert.equal(cleared[field], "all");
  const params = new URL(controller.calls.at(-1)!.url, "https://test.invalid").searchParams;
  assert.equal(params.get("range"), "30d");
  for (const field of ["search", "service", "method", "status", "capture", "before_timestamp"]) assert.equal(params.has(field), false);
  controller.unmount();
});

test("Back and Forward reset scope, cursor and inspector while aborting late requests and preserving pause", async () => {
  let resolveLate!: (response: RequestsResponse) => void;
  let pending = false;
  const controller = await loadController("acme", () => pending ? new Promise((resolve) => { resolveLate = resolve; }) : Promise.resolve(data), { service: "api", range: "24h", search: "checkout" });
  controller.render(); controller.commit(); await flush();
  controller.render().content.onToggleLive();
  controller.render(); controller.commit(); await flush();
  controller.render().content.onNextPage();
  controller.render(); controller.commit(); await flush();
  assert.equal(controller.render().content.page, 1);
  controller.render().content.onInspect(request, { focus() {} });
  pending = true;
  controller.render().content.onNextPage();
  controller.render(); controller.commit();
  const oldRequest = controller.calls.at(-1)!;
  assert.equal(new URL(oldRequest.url, "https://test.invalid").searchParams.has("before_timestamp"), true);
  controller.render().content.onSearchChange("orders draft");
  controller.render(); controller.commit();
  assert.ok([...controller.timers.values()].some((timer) => timer.delay === 300));
  const navigationCount = controller.navigations.length;
  pending = false;
  controller.navigateExternal({ service: "worker", range: "6h", search: "checkout", method: "HEAD", status: "success", capture: "full" });
  let rendered = controller.render();
  assert.equal(rendered.content.page, 0);
  assert.equal(rendered.inspector.props.request, null);
  assert.equal(rendered.content.search, "checkout");
  controller.commit(); await flush();
  controller.render(); controller.commit(); await flush();
  assert.equal(oldRequest.signal.aborted, true);
  assert.equal(controller.timers.size, 0, "external navigation cancels the uncommitted search even when its committed query is unchanged");
  assert.equal(controller.navigations.length, navigationCount, "the pending debounce cannot replace restored history");
  rendered = controller.render();
  assert.equal(rendered.content.live, false);
  assert.equal(rendered.content.service, "worker");
  assert.equal(rendered.content.search, "checkout");
  assert.equal(rendered.content.data, data);
  const restoredParams = new URL(controller.calls.at(-1)!.url, "https://test.invalid").searchParams;
  assert.equal(restoredParams.get("service"), "worker");
  assert.equal(restoredParams.get("range"), "6h");
  assert.equal(restoredParams.has("before_timestamp"), false);
  resolveLate({ ...data, total: 999, requests: [{ ...request, id: "old-response" }] }); await flush();
  assert.equal(controller.render().content.data, data, "a late previous-filter response cannot leak into the restored scope");
  controller.navigateExternal({ service: "api", range: "24h", search: "checkout" });
  controller.render(); controller.commit(); await flush();
  assert.equal(controller.render().content.service, "api");
  assert.equal(controller.render().content.range, "24h");
  assert.equal(controller.render().content.page, 0);
  assert.equal(controller.render().content.live, false);
  controller.unmount();
});
