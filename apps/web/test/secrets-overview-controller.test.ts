import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as overviewData from "../src/components/secrets/overview-data";
import {
  secretsOverviewQuery,
  type SecretsOverviewSnapshot,
} from "../src/components/secrets/overview-query";
import type { SecretsOverviewContentProps } from "../src/components/secrets/overview-content";
import type { SecretProject } from "../src/lib/secrets-client";

const project: SecretProject = {
  id: "vault-a", name: "Payments API", slug: "payments-api", description: "Application credentials",
  environments: [], environmentCount: 0, secretCount: 0,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
const snapshot: SecretsOverviewSnapshot = {
  projectCount: 1, environmentCount: 0, secretCount: 0,
  projects: [project], recentActivity: [], receivedAt: Date.parse("2026-10-05T12:00:00Z"),
};

type Effect = { callback: () => void | (() => void); deps: unknown[] };
type HookScope = {
  values: any[];
  index: number;
  dirty: boolean;
  effects: Effect[];
  committed: Array<{ deps: unknown[]; cleanup?: () => void }>;
};
const createScope = (): HookScope => ({ values: [], index: 0, dirty: false, effects: [], committed: [] });

/** Runs the actual route and ProjectDialog hooks in separate component scopes. */
async function loadController(orgSlug = "acme", initialSearch: unknown = {}) {
  const [routeSource, dialogSource] = await Promise.all([
    readFile(new URL("../src/routes/$orgSlug/secrets/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/secrets/secret-dialogs.tsx", import.meta.url), "utf8"),
  ]);
  const compile = (source: string) => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  let routeOrg = orgSlug;
  let search = overviewData.normalizeSecretsOverviewSearch(initialSearch);
  let retries = 0;
  let timerId = 0;
  let result: { data?: SecretsOverviewSnapshot; isPending: boolean; isFetching: boolean; error: Error | null } = {
    data: undefined, isPending: true, isFetching: true, error: null,
  };
  const routeScope = createScope();
  const dialogScope = createScope();
  let currentScope = routeScope;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const queryCalls: Array<ReturnType<typeof secretsOverviewQuery>> = [];
  const navigations: Array<{ search: overviewData.SecretsOverviewSearch; replace?: boolean; resetScroll?: boolean }> = [];
  const saves: Array<{ orgSlug: string; input: { name: string; slug: string; description: string } }> = [];
  const Content = () => null;
  const SecretsDialog = () => null;
  const DialogForm = () => null;
  const Field = () => null;
  const Placeholder = () => null;
  const sameDependencies = (left: unknown[], right: unknown[]) =>
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    useState(initial: any) {
      const scope = currentScope;
      const slot = scope.index++;
      if (!(slot in scope.values)) scope.values[slot] = typeof initial === "function" ? initial() : initial;
      return [scope.values[slot], (next: any) => {
        const value = typeof next === "function" ? next(scope.values[slot]) : next;
        if (!Object.is(value, scope.values[slot])) { scope.values[slot] = value; scope.dirty = true; }
      }];
    },
    useEffect(callback: Effect["callback"], deps: unknown[]) { currentScope.effects.push({ callback, deps }); },
  };
  const dialogModule = { exports: {} as any };
  runInNewContext(compile(dialogSource), {
    React, module: dialogModule, exports: dialogModule.exports,
    require: (specifier: string) => {
      if (specifier.endsWith("ui/workspace-input")) return { WorkspaceInput: "input", WorkspaceTextarea: "textarea" };
      if (specifier === "react") return hooks;
      if (specifier === "@/lib/secrets-client") return { secretsClient: {
        createProject: async (slug: string, input: { name: string; slug: string; description: string }) => {
          saves.push({ orgSlug: slug, input: { ...input } });
          return { ...project, id: "new-vault", ...input };
        },
      } };
      if (specifier === "./secrets-ui") return {
        SecretsDialog, DialogForm, Field, SecretsBadge: Placeholder, SecretsButton: Placeholder,
        SecretsNotice: Placeholder, ProductionConfirmation: Placeholder, fieldClassName: "field", textareaClassName: "textarea",
      };
      // This harness exercises ProjectDialog; environment controller behavior
      // is covered by its own scoped dialog tests.
      if (specifier === "./environment-dialog") return { EnvironmentDialog: Placeholder };
      if (specifier === "@hugeicons/react") return { HugeiconsIcon: Placeholder };
      if (specifier.startsWith("@hugeicons-pro/")) return Placeholder;
      throw new Error(`Unexpected vault dialog dependency: ${specifier}`);
    },
  });
  const navigate = (navigation: any) => {
    search = overviewData.normalizeSecretsOverviewSearch(
      typeof navigation.search === "function" ? navigation.search(search) : navigation.search,
    );
    navigations.push({ search, replace: navigation.replace, resetScroll: navigation.resetScroll });
    return Promise.resolve();
  };
  const routeModule = { exports: {} as any };
  runInNewContext(compile(routeSource), {
    React, module: routeModule, exports: routeModule.exports,
    window: {
      setTimeout: (callback: () => void, delay: number) => { timers.set(++timerId, { callback, delay }); return timerId; },
      clearTimeout: (id: number) => timers.delete(id),
    },
    require: (specifier: string) => {
      if (specifier === "react") return hooks;
      if (specifier === "@tanstack/react-query") return {
        useQuery: (options: ReturnType<typeof secretsOverviewQuery>) => {
          queryCalls.push(options);
          return { ...result, refetch: async () => { retries++; } };
        },
      };
      if (specifier === "@tanstack/react-router") return {
        createFileRoute: () => (options: any) => ({
          options, useParams: () => ({ orgSlug: routeOrg }), useSearch: () => search, useNavigate: () => navigate,
        }),
      };
      if (specifier.endsWith("/secret-dialogs")) return { ProjectDialog: dialogModule.exports.ProjectDialog };
      if (specifier.endsWith("/overview-content")) return { SecretsOverviewContent: Content };
      if (specifier.endsWith("/overview-data")) return overviewData;
      if (specifier.endsWith("/overview-query")) return { secretsOverviewQuery };
      throw new Error(`Unexpected Secrets controller dependency: ${specifier}`);
    },
  });
  function collect(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(collect);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>;
    return [element, ...collect(element.props.children)];
  }
  function renderComponent(component: (props: any) => React.ReactNode, props: any, scope: HookScope) {
    let tree: React.ReactNode;
    let passes = 0;
    do {
      assert.ok(passes++ < 20, "component state must settle without a render loop");
      currentScope = scope;
      scope.index = 0; scope.dirty = false; scope.effects = [];
      tree = component(props);
      // React does not commit effects from a render discarded by a state update.
      if (!scope.dirty) scope.effects.forEach((effect, index) => {
        const previous = scope.committed[index];
        if (previous && sameDependencies(previous.deps, effect.deps)) return;
        previous?.cleanup?.();
        scope.committed[index] = { deps: effect.deps.slice(), cleanup: effect.callback() ?? undefined };
      });
    } while (scope.dirty);
    return collect(tree);
  }
  return {
    queryCalls, navigations, timers, saves,
    get search() { return search; },
    get retries() { return retries; },
    setResult(next: Partial<typeof result>) { result = { ...result, ...next }; },
    setSearch(next: unknown) { search = overviewData.normalizeSecretsOverviewSearch(next); },
    shell(nextOrg = routeOrg) {
      routeOrg = nextOrg;
      return routeModule.exports.Route.options.component() as React.ReactElement<any>;
    },
    validate: routeModule.exports.Route.options.validateSearch as typeof overviewData.normalizeSecretsOverviewSearch,
    tick() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); } },
    render() {
      const routeTree = renderComponent(routeModule.exports.WorkspaceSecretsOverview, { orgSlug: routeOrg }, routeScope);
      const content = routeTree.find((element) => element.type === Content);
      const dialog = routeTree.find((element) => element.type === dialogModule.exports.ProjectDialog);
      assert.ok(content); assert.ok(dialog, "ProjectDialog stays mounted outside data-state branches");
      const dialogTree = renderComponent(dialogModule.exports.ProjectDialog, dialog.props, dialogScope);
      const fields = (label: string) => {
        const field = dialogTree.find((element) => element.type === Field && element.props.label === label);
        assert.ok(field, `the real dialog exposes ${label}`);
        return (field.props.children as React.ReactElement<any>).props;
      };
      return {
        content: content.props as SecretsOverviewContentProps,
        dialog,
        inputs: { name: fields("Vault name"), slug: fields("Slug"), description: fields("Description") },
        form: dialogTree.find((element) => element.type === DialogForm)!.props,
      };
    },
    dispose() { [routeScope, dialogScope].forEach((scope) => scope.committed.forEach((effect) => effect.cleanup?.())); },
  };
}

test("direct overview links restore normalized search/sort and use an organization-only query key", async () => {
  const controller = await loadController("team /?β", { search: " payments /? ", sort: "name" });
  const view = controller.render();
  assert.equal(view.content.orgSlug, "team /?β");
  assert.equal(view.content.searchInput, "payments /?");
  assert.equal(view.content.sort, "name");
  assert.deepEqual(controller.queryCalls.at(-1)?.queryKey, ["secrets", "overview", "team /?β"]);
  assert.equal(controller.navigations.length, 0);
  assert.deepEqual(controller.validate({ search: [], sort: "secrets", unknown: "ignored" }), {});
  assert.deepEqual(controller.validate({ search: " api ", sort: "updated" }), { search: "api" });
  controller.dispose();
});

test("typing uses one 250ms replace debounce without changing server-query identity", async () => {
  const controller = await loadController("acme", { sort: "name" });
  controller.render().content.onSearchInputChange("payment"); controller.render();
  assert.equal(controller.search.search, undefined);
  assert.equal(controller.navigations.length, 0);
  assert.equal(controller.timers.size, 1);
  assert.equal([...controller.timers.values()][0].delay, 250);
  controller.render().content.onSearchInputChange("payment retry"); controller.render();
  assert.equal(controller.timers.size, 1, "new input cancels the previous debounce");
  controller.tick(); controller.render();
  assert.deepEqual(controller.search, { search: "payment retry", sort: "name" });
  assert.equal(controller.navigations.length, 1);
  assert.equal(controller.navigations[0].replace, true);
  assert.equal(controller.navigations[0].resetScroll, false);
  assert.ok(controller.queryCalls.every((options) => options.queryKey.join() === "secrets,overview,acme"));
  controller.dispose();
});

test("sort commits the current search draft immediately and clear preserves sorting", async () => {
  const controller = await loadController("acme", { search: "old" });
  controller.render().content.onSearchInputChange("new draft"); controller.render();
  controller.render().content.onSortChange("name");
  const sorted = controller.render();
  assert.deepEqual(controller.search, { search: "new draft", sort: "name" });
  assert.equal(sorted.content.searchInput, "new draft");
  assert.equal(sorted.content.sort, "name");
  assert.equal(controller.navigations.at(-1)?.resetScroll, false);
  assert.equal(controller.timers.size, 0, "immediate sorting cancels the pending search commit");
  sorted.content.onSearchInputChange("pending clear"); controller.render();
  controller.render().content.onClearSearch();
  const cleared = controller.render();
  assert.deepEqual(controller.search, { sort: "name" });
  assert.equal(cleared.content.searchInput, "");
  assert.equal(controller.timers.size, 0);
  cleared.content.onSortChange("updated"); controller.render();
  assert.deepEqual(controller.search, {});
  controller.dispose();
});

test("Back/Forward restores URL search and sort while canceling an old debounce", async () => {
  const controller = await loadController("acme", { search: "initial" });
  controller.render().content.onSearchInputChange("uncommitted"); controller.render();
  assert.equal(controller.timers.size, 1);
  controller.setSearch({ search: "restored", sort: "name" });
  const restored = controller.render();
  assert.equal(restored.content.searchInput, "restored");
  assert.equal(restored.content.sort, "name");
  assert.equal(controller.timers.size, 0);
  controller.tick();
  assert.equal(controller.navigations.length, 0, "a pending draft must not replace browser history");
  controller.render().content.onSearchInputChange("next draft"); controller.render();
  controller.dispose();
  assert.equal(controller.timers.size, 0, "unmount cancels the search debounce");
});

test("New vault opens the existing create dialog and closing does not refetch", async () => {
  const controller = await loadController();
  let view = controller.render();
  assert.equal(view.dialog.props.open, false);
  view.content.onCreate(); view = controller.render();
  assert.equal(view.dialog.props.open, true);
  assert.equal(view.dialog.props.project, undefined, "creation must not acquire a refreshed project identity");
  assert.equal(view.dialog.props.orgSlug, "acme");
  view.dialog.props.onClose(); view = controller.render();
  assert.equal(view.dialog.props.open, false);
  assert.equal(controller.retries, 0);
  controller.dispose();
});

test("background refresh and failure preserve the open dialog's unsaved form identity", async () => {
  const controller = await loadController();
  controller.setResult({ data: snapshot, isPending: false, isFetching: false });
  controller.render().content.onCreate();
  let view = controller.render();
  const identity = { type: view.dialog.type, key: view.dialog.key, project: view.dialog.props.project };
  view.inputs.name.onChange({ target: { value: "Unsubmitted API" } });
  view.inputs.slug.onChange({ target: { value: "custom-vault" } });
  view.inputs.description.onChange({ target: { value: "Unsaved configuration" } });
  view = controller.render();
  const refreshed = { ...snapshot, projects: [{ ...project, name: "Updated existing vault" }], receivedAt: snapshot.receivedAt + 30_000 };
  controller.setResult({ data: refreshed, isFetching: true });
  view = controller.render();
  assert.equal(view.content.data, refreshed);
  assert.equal(view.content.loading, false);
  assert.equal(view.content.isFetching, true);
  assert.equal(view.dialog.props.open, true);
  assert.deepEqual({ type: view.dialog.type, key: view.dialog.key, project: view.dialog.props.project }, identity);
  assert.deepEqual([view.inputs.name.value, view.inputs.slug.value, view.inputs.description.value],
    ["Unsubmitted API", "custom-vault", "Unsaved configuration"]);
  controller.setResult({ isFetching: false, error: new Error("Overview unavailable") });
  view = controller.render();
  assert.equal(view.content.data, refreshed);
  assert.equal(view.content.error, "Overview unavailable");
  assert.equal(view.content.loading, false);
  assert.equal(view.dialog.props.open, true);
  assert.deepEqual([view.inputs.name.value, view.inputs.slug.value, view.inputs.description.value],
    ["Unsubmitted API", "custom-vault", "Unsaved configuration"]);
  view.content.onRetry(); controller.render();
  assert.equal(controller.retries, 1);
  assert.equal(controller.saves.length, 0, "refresh and retry must not submit a draft");
  controller.dispose();
});

test("successful vault creation uses the existing save flow and refetches overview once", async () => {
  const controller = await loadController("org/team");
  controller.setResult({ data: snapshot, isPending: false, isFetching: false });
  controller.render().content.onCreate();
  let view = controller.render();
  view.inputs.name.onChange({ target: { value: "  New API  " } });
  view.inputs.description.onChange({ target: { value: "  Configuration  " } });
  view = controller.render();
  let prevented = false;
  await view.form.onSubmit({ preventDefault() { prevented = true; } });
  view = controller.render();
  assert.equal(prevented, true);
  assert.deepEqual(controller.saves, [{ orgSlug: "org/team", input: { name: "New API", slug: "new-api", description: "Configuration" } }]);
  assert.equal(controller.retries, 1);
  assert.equal(view.dialog.props.open, false);
  assert.equal(view.content.data, snapshot, "creation waits for the real overview result, not invented counts");
  assert.equal(controller.navigations.length, 0);
  controller.dispose();
});

test("the organization-keyed shell remounts local search/dialog state for another team", async () => {
  const controller = await loadController("old-team", { search: "old search" });
  controller.setResult({ data: snapshot, isPending: false, isFetching: false });
  controller.render().content.onCreate();
  const oldView = controller.render();
  oldView.inputs.name.onChange({ target: { value: "Old team's draft" } });
  controller.render().content.onSearchInputChange("pending old search"); controller.render();
  const oldShell = controller.shell();
  const nextShell = controller.shell("new-team");
  assert.equal(oldShell.key, "old-team");
  assert.equal(nextShell.key, "new-team");
  assert.equal(nextShell.props.orgSlug, "new-team");
  assert.equal(nextShell.type, oldShell.type, "a changed React key, not data refresh, resets the component");
  controller.dispose();
  assert.equal(controller.timers.size, 0);
  const destination = await loadController("new-team");
  const newView = destination.render();
  assert.deepEqual(destination.queryCalls.at(-1)?.queryKey, ["secrets", "overview", "new-team"]);
  assert.equal(newView.content.data, undefined);
  assert.equal(newView.content.searchInput, "");
  assert.equal(newView.dialog.props.open, false);
  assert.equal(newView.inputs.name.value, "");
  destination.dispose();
});
