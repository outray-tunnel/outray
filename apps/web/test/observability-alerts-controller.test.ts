import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as alertsData from "../src/components/observability/alerts-data";
import { observabilityAlertsQuery } from "../src/components/observability/alerts-query";
import { alertFixture, alertsSnapshot } from "./fixtures/observability-alert";

/** Exercise actual controller hooks, search debounce and save callbacks without a server. */
async function loadController(orgSlug = "outray-tunnel", initialSearch: unknown = {}) {
  const source = await readFile(new URL("../src/routes/$orgSlug/observability/alerts.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(`${source}\nexport { WorkspaceAlerts };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  let routeOrg = orgSlug; let search = alertsData.normalizeAlertsSearch(initialSearch); let retries = 0; let dirty = false;
  let result: { data?: alertsData.AlertsSnapshot; isPending: boolean; isFetching: boolean; error: Error | null } = { data: undefined, isPending: true, isFetching: true, error: null };
  const values: any[] = []; const refs: Array<{ current: any }> = [];
  const activeEffects: Array<{ deps: unknown[]; cleanup?: () => void }> = []; let effects: Array<{ callback: () => void | (() => void); deps: unknown[] }> = [];
  let stateIndex = 0; let refIndex = 0; let timerId = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const queryCalls: Array<ReturnType<typeof observabilityAlertsQuery>> = [];
  const navigations: Array<{ search: alertsData.AlertsSearch; resetScroll: boolean; replace: boolean }> = [];
  const storage = new Map<string, string>(); const redirects: string[] = []; const invalidations: unknown[] = [];
  let storageFails = false;
  const Content = () => null; const Form = () => null; const module = { exports: {} as any };
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const navigate = (input: any) => { search = alertsData.normalizeAlertsSearch(typeof input.search === "function" ? input.search(search) : input.search); navigations.push({ search, resetScroll: input.resetScroll, replace: input.replace }); return Promise.resolve(); };
  runInNewContext(compiled, {
    React, module, exports: module.exports, URLSearchParams,
    window: { setTimeout: (callback: () => void, delay: number) => { timers.set(++timerId, { callback, delay }); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
      sessionStorage: { setItem: (key: string, value: string) => { if (storageFails) throw new Error("Unavailable"); storage.set(key, value); } }, location: { assign: (url: string) => redirects.push(url) } },
    require: (specifier: string) => {
      if (specifier === "react") return {
        useState: (initial: any) => { const slot = stateIndex++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial; return [values[slot], (next: any) => { const value = typeof next === "function" ? next(values[slot]) : next; if (!Object.is(value, values[slot])) { values[slot] = value; dirty = true; } }]; },
        useRef: (initial: any) => { const slot = refIndex++; return refs[slot] ?? (refs[slot] = { current: initial }); },
        useEffect: (callback: () => void | (() => void), deps: unknown[]) => effects.push({ callback, deps }),
      };
      if (specifier === "@tanstack/react-query") return {
        useQuery: (options: ReturnType<typeof observabilityAlertsQuery>) => { queryCalls.push(options); return { ...result, refetch: async () => { retries++; } }; },
        useQueryClient: () => ({ setQueryData: (_key: unknown, update: (current?: alertsData.AlertsSnapshot) => alertsData.AlertsSnapshot | undefined) => { result.data = update(result.data); }, invalidateQueries: (input: unknown) => { invalidations.push(input); return Promise.resolve(); } }),
      };
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (options: any) => ({ options, useParams: () => ({ orgSlug: routeOrg }), useSearch: () => search, useNavigate: () => navigate }) };
      if (specifier.endsWith("/alerts-list-content")) return { AlertsListContent: Content };
      if (specifier.endsWith("/alerts-data")) return alertsData;
      if (specifier.endsWith("/alerts-query")) return { observabilityAlertsQuery };
      if (specifier.endsWith("/alert-form")) return { AlertFormModal: Form };
      if (specifier.endsWith("/alert-status-badge")) return {};
      throw new Error(`Unexpected Alerts controller dependency: ${specifier}`);
    },
  });
  const find = (node: React.ReactNode, type: unknown): React.ReactElement<any> | undefined => {
    if (Array.isArray(node)) { for (const child of node) { const element = find(child, type); if (element) return element; } return; }
    if (!React.isValidElement(node)) return; const element = node as React.ReactElement<any>;
    return element.type === type ? element : find(element.props.children, type);
  };
  return {
    module, queryCalls, navigations, timers, storage, redirects, invalidations,
    setResult(next: Partial<typeof result>) { result = { ...result, ...next }; }, setSearch(next: unknown) { search = alertsData.normalizeAlertsSearch(next); }, setOrg(value: string) { routeOrg = value; }, failStorage() { storageFails = true; },
    get retries() { return retries; }, get search() { return search; },
    tick() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); } },
    render() {
      let tree!: React.ReactNode; let passes = 0;
      do { dirty = false; stateIndex = 0; refIndex = 0; effects = []; tree = module.exports.WorkspaceAlerts({ orgSlug: routeOrg }); if (++passes > 10) throw new Error("Render loop"); } while (dirty);
      effects.forEach(({ callback, deps }, index) => { const current = activeEffects[index]; if (!current || !same(current.deps, deps)) { current?.cleanup?.(); activeEffects[index] = { deps, cleanup: callback() || undefined }; } });
      return { content: find(tree, Content)!.props, form: find(tree, Form)!.props };
    },
    dispose() { activeEffects.forEach((effect) => effect.cleanup?.()); },
  };
}

test("the controller restores direct-link filters and scopes cache plus child state per organization", async () => {
  const harness = await loadController("org-a", { search: " queue ", signal: "metric_value", state: "healthy" });
  const view = harness.render(); assert.equal(view.content.searchInput, "queue"); assert.equal(view.content.filters.signal, "metric_value");
  assert.deepEqual(harness.queryCalls.at(-1)?.queryKey, ["observability", "alerts", "org-a"]);
  const shell = harness.module.exports.Route.options.component(); assert.equal(shell.key, "org-a"); assert.equal(shell.props.orgSlug, "org-a");
  harness.setOrg("org-b"); const nextShell = harness.module.exports.Route.options.component(); assert.equal(nextShell.key, "org-b"); harness.dispose();
});

test("search uses a 250ms replace debounce and combines current filters without scroll reset", async () => {
  const harness = await loadController("org", { state: "firing" });
  let view = harness.render(); view.content.onSearchInputChange("payments"); view = harness.render();
  assert.equal(harness.navigations.length, 0); assert.equal(harness.timers.size, 1); assert.equal([...harness.timers.values()][0].delay, 250);
  harness.tick(); assert.equal(harness.search.search, "payments"); assert.equal(harness.search.state, "firing");
  assert.equal(harness.navigations[0].replace, true); assert.equal(harness.navigations[0].resetScroll, false);
  view = harness.render(); view.content.onFiltersChange({ service: "queue" }); harness.render();
  assert.equal(harness.search.service, "queue"); assert.equal(harness.search.search, "payments");
  assert.ok(harness.queryCalls.every((options) => options.queryKey.join() === "observability,alerts,org")); harness.dispose();
});

test("Back/Forward cancels an old debounce rather than replacing the restored filters", async () => {
  const harness = await loadController("org", { search: "old" });
  harness.render().content.onSearchInputChange("typing"); harness.render(); assert.equal(harness.timers.size, 1);
  harness.setSearch({ search: "restored", service: "queue" }); const view = harness.render();
  assert.equal(view.content.searchInput, "restored"); assert.equal(harness.timers.size, 0); harness.tick(); assert.equal(harness.navigations.length, 0); harness.dispose();
});

test("clear filters clears pending text and URL state while keeping all rules in cache", async () => {
  const harness = await loadController("org", { search: "queue", service: "queue", signal: "metric_value", state: "healthy" });
  const view = harness.render(); view.content.onClearFilters(); const cleared = harness.render();
  assert.deepEqual(harness.search, {}); assert.equal(cleared.content.searchInput, ""); assert.equal(harness.timers.size, 0); harness.dispose();
});

test("refresh and failure preserve the create flow, rule data and submitted content ownership", async () => {
  const harness = await loadController(); harness.setResult({ data: alertsSnapshot, isPending: false, isFetching: false });
  harness.render().content.onCreate(); let view = harness.render(); assert.equal(view.form.isOpen, true);
  harness.setResult({ data: { ...alertsSnapshot }, isFetching: true }); view = harness.render();
  assert.equal(view.form.isOpen, true); assert.equal(view.content.data.alerts[0].id, "rule-a"); assert.equal(view.form.initialAlert, undefined);
  harness.setResult({ error: new Error("Unavailable"), isFetching: false }); view = harness.render(); assert.equal(view.form.isOpen, true); assert.equal(view.content.error, "Unavailable");
  view.content.onRetry(); assert.equal(harness.retries, 1); harness.dispose();
});

test("save adds a new rule with accurate state counts before refetch and closes creation", async () => {
  const harness = await loadController(); harness.setResult({ data: alertsSnapshot, isPending: false, isFetching: false });
  harness.render().content.onCreate(); let view = harness.render();
  view.form.onSaved(alertFixture({ id: "new-rule", state: "no_data", currentValue: null, lastEvaluatedAt: null }), []);
  view = harness.render(); assert.equal(view.form.isOpen, false); assert.equal(view.content.data.alerts[0].id, "new-rule");
  assert.equal(view.content.data.summary.total, 3); assert.equal(view.content.data.summary.noData, 1); assert.equal(view.content.data.summary.firing, 1);
  assert.equal(harness.invalidations.length, 1); assert.equal(harness.redirects.length, 0); assert.equal(alertsSnapshot.alerts.length, 2); harness.dispose();
});

test("notification setup queue persists and redirects with list context even when session storage fails", async () => {
  for (const failStorage of [false, true]) {
    const harness = await loadController("org/team", { service: "queue", state: "firing" });
    if (failStorage) harness.failStorage(); harness.render().form.onSaved(alertFixture({ id: "rule/a" }), ["slack", "discord"]);
    assert.equal(harness.redirects.length, 1); const url = new URL(harness.redirects[0], "https://local.test");
    assert.equal(url.pathname, "/org%2Fteam/observability/alerts/rule%2Fa/notifications"); assert.equal(url.searchParams.get("setup"), "slack,discord");
    assert.equal(url.searchParams.get("service"), "queue"); assert.equal(url.searchParams.get("state"), "firing");
    if (!failStorage) assert.equal(harness.storage.get("outray-alert-setup:rule/a"), '["slack","discord"]'); harness.dispose();
  }
});
