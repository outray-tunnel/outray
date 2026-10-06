import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as overviewData from "../src/components/secrets/overview-data";
import * as utils from "../src/components/secrets/utils";
import type { VaultsContentProps } from "../src/components/secrets/vaults-content";
import type { SecretProject } from "../src/lib/secrets-client";

const project: SecretProject = {
  id: "vault-api", name: "API", slug: "api", description: "Application credentials",
  environments: [], environmentCount: 0, secretCount: 0,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
type Effect = { callback: () => void | (() => void); deps: unknown[] };
type ResourceResult = { data: SecretProject[] | null; loading: boolean; refreshing: boolean; error: string | null };

/** Real workspace handlers; lifecycle tests also execute the real resource hook. */
async function loadController(orgSlug = "acme", realResource = false) {
  const [source, resourceSource] = await Promise.all([
    readFile(new URL("../src/components/secrets/vaults-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/secrets/use-secrets-resource.ts", import.meta.url), "utf8"),
  ]);
  const compile = (value: string) => ts.transpileModule(value, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  let result: ResourceResult = { data: null, loading: true, refreshing: false, error: null };
  let loader: ((signal: AbortSignal) => Promise<SecretProject[]>) | undefined;
  let projectsResult: (signal: AbortSignal) => Promise<SecretProject[]> = async () => [project];
  let index = 0; let dirty = false; let disposed = false; let lateStateWrites = 0; let retries = 0;
  const values: any[] = [];
  let effects: Effect[] = [];
  const committed: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  const dependencies: string[][] = [];
  const calls: Array<{ orgSlug: string; signal: AbortSignal }> = [];
  const Content = () => null; const Dialog = () => null;
  const sameDependencies = (left: unknown[], right: unknown[]) =>
    left.length === right.length && left.every((value, position) => Object.is(value, right[position]));
  const hooks = {
    useState: (initial: any) => {
      const slot = index++;
      if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
      return [values[slot], (next: any) => {
        if (disposed) lateStateWrites++;
        const value = typeof next === "function" ? next(values[slot]) : next;
        if (!Object.is(value, values[slot])) { values[slot] = value; dirty = true; }
      }];
    },
    useRef: (initial: any) => { const slot = index++; return values[slot] ?? (values[slot] = { current: initial }); },
    useEffect: (callback: Effect["callback"], deps: unknown[]) => effects.push({ callback, deps }),
    useCallback: (callback: (...args: any[]) => any, deps: unknown[]) => {
      const slot = index++; const previous = values[slot];
      if (!previous || !sameDependencies(previous.deps, deps)) values[slot] = { callback, deps: deps.slice() };
      return values[slot].callback;
    },
  };
  const resourceModule = { exports: {} as any };
  runInNewContext(compile(resourceSource), {
    React, module: resourceModule, exports: resourceModule.exports, Error, DOMException, AbortController,
    require: (specifier: string) => { assert.equal(specifier, "react"); return hooks; },
  });
  const module = { exports: {} as any };
  runInNewContext(compile(source), {
    React, module, exports: module.exports, Error, DOMException,
    require: (specifier: string) => {
      if (specifier === "react") return hooks;
      if (specifier === "./vaults-content") return { VaultsContent: Content };
      if (specifier === "./secret-dialogs") return { ProjectDialog: Dialog };
      if (specifier === "./use-secrets-resource") return { useSecretsResource: (nextLoader: typeof loader, deps: string[]) => {
        loader = nextLoader; dependencies.push(Array.from(deps));
        const resource = realResource ? resourceModule.exports.useSecretsResource(nextLoader, deps) : result;
        return { ...resource, reload: () => { retries++; if (realResource) resource.reload(); } };
      } };
      if (specifier === "@/lib/secrets-client") return { secretsClient: {
        projects: async (org: string, signal: AbortSignal) => { calls.push({ orgSlug: org, signal }); return projectsResult(signal); },
      } };
      throw new Error(`Unexpected vault catalog dependency: ${specifier}`);
    },
  });
  function collect(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(collect);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>;
    return [element, ...collect(element.props.children)];
  }
  return {
    calls, dependencies,
    get retries() { return retries; }, get lateStateWrites() { return lateStateWrites; },
    setResult(next: Partial<ResourceResult>) { assert.equal(realResource, false); result = { ...result, ...next }; },
    setProjectsResult(next: typeof projectsResult) { projectsResult = next; },
    load(signal = new AbortController().signal) { assert.ok(loader); return loader(signal); },
    shell(nextOrg = orgSlug) { return module.exports.VaultsPageView({ orgSlug: nextOrg }) as React.ReactElement<any>; },
    render() {
      assert.equal(disposed, false);
      let tree: React.ReactNode; let passes = 0;
      do {
        assert.ok(passes++ < 20, "workspace state must settle without a render loop");
        index = 0; dirty = false; effects = [];
        tree = module.exports.VaultsWorkspace({ orgSlug });
        if (!dirty) effects.forEach((effect, position) => {
          const previous = committed[position];
          if (previous && sameDependencies(previous.deps, effect.deps)) return;
          previous?.cleanup?.();
          committed[position] = { deps: effect.deps.slice(), cleanup: effect.callback() ?? undefined };
        });
      } while (dirty);
      const elements = collect(tree);
      const content = elements.find((element) => element.type === Content);
      const dialog = elements.find((element) => element.type === Dialog);
      assert.ok(content); assert.ok(dialog, "creation dialog is outside catalog data-state branches");
      return { content: content.props as VaultsContentProps, dialog };
    },
    dispose() { committed.forEach((effect) => effect.cleanup?.()); disposed = true; },
  };
}

async function settle() { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); }

test("catalog loads the complete organization-scoped metadata response with its exact abort signal", async () => {
  const controller = await loadController("team /?β");
  const catalog = Array.from({ length: 9 }, (_, index) => ({ ...project, id: `vault-${index}`, slug: `vault-${index}` }));
  controller.setProjectsResult(async () => catalog);
  const initial = controller.render();
  assert.equal(initial.content.orgSlug, "team /?β");
  assert.equal(initial.content.projects, null);
  assert.equal(initial.content.loading, true);
  assert.equal(initial.dialog.props.open, false);
  assert.deepEqual(controller.dependencies.at(-1), ["team /?β"]);
  const signal = new AbortController().signal;
  assert.equal(await controller.load(signal), catalog, "the full response is not reduced to the overview preview");
  assert.deepEqual(controller.calls, [{ orgSlug: "team /?β", signal }]);
  controller.dispose();
});

test("catalog rejects an aborted response instead of exposing its returned metadata", async () => {
  const controller = await loadController(); controller.render();
  const cancellation = new AbortController();
  controller.setProjectsResult(async () => { cancellation.abort(); return [project]; });
  await assert.rejects(controller.load(cancellation.signal), { name: "AbortError" });
  assert.equal(controller.calls.length, 1);
  assert.equal(controller.calls[0].signal, cancellation.signal);
  assert.equal(controller.render().content.projects, null);
  controller.dispose();
});

test("create, close, search, sort, retry, and save remain explicit independent controller actions", async () => {
  const controller = await loadController();
  controller.setResult({ data: [project], loading: false });
  let view = controller.render();
  assert.equal(view.content.search, ""); assert.equal(view.content.sort, "updated");
  view.content.onSearchChange("  custom /?β  "); view.content.onSortChange("name");
  view = controller.render();
  assert.equal(view.content.search, "  custom /?β  ", "typing preserves the untrimmed search draft");
  assert.equal(view.content.sort, "name");
  assert.equal(controller.calls.length, 0, "local search/sort must not request plaintext or metadata");
  assert.equal(controller.retries, 0);
  assert.deepEqual(controller.dependencies.at(-1), ["acme"], "filters never change the organization resource identity");
  view.content.onCreate(); view = controller.render();
  assert.equal(view.dialog.props.open, true);
  assert.equal(view.dialog.props.orgSlug, "acme");
  assert.equal(view.dialog.props.project, undefined, "new-vault creation cannot become edit during refresh");
  view.dialog.props.onClose(); view = controller.render();
  assert.equal(view.dialog.props.open, false); assert.equal(controller.retries, 0);
  view.content.onRetry(); assert.equal(controller.retries, 1);
  view.dialog.props.onSaved({ ...project, id: "created-vault" });
  assert.equal(controller.retries, 2);
  assert.deepEqual(controller.render().content.projects, [project], "save requests authoritative metadata rather than fabricating a row");
  view.content.onSearchChange(""); view.content.onSortChange("updated");
  view = controller.render(); assert.equal(view.content.search, ""); assert.equal(view.content.sort, "updated");
  controller.dispose();
});

test("background loading or errors preserve catalog filters and the mounted create-dialog identity", async () => {
  const controller = await loadController();
  controller.setResult({ data: [project], loading: false });
  let view = controller.render();
  view.content.onSearchChange("pending filter"); view.content.onSortChange("name"); view.content.onCreate();
  view = controller.render();
  const identity = { type: view.dialog.type, key: view.dialog.key, project: view.dialog.props.project };
  const refreshed = [{ ...project, name: "Updated API" }];
  for (const state of [
    { data: refreshed, loading: true, refreshing: true, error: null },
    { data: refreshed, loading: false, refreshing: false, error: "Vault refresh unavailable" },
  ]) {
    controller.setResult(state); view = controller.render();
    assert.equal(view.content.projects, refreshed);
    assert.equal(view.content.loading, state.loading);
    assert.equal(view.content.refreshing, state.refreshing);
    assert.equal(view.content.error, state.error);
    assert.equal(view.content.search, "pending filter"); assert.equal(view.content.sort, "name");
    assert.equal(view.dialog.props.open, true);
    assert.deepEqual({ type: view.dialog.type, key: view.dialog.key, project: view.dialog.props.project }, identity);
  }
  assert.equal(controller.retries, 0);
  controller.dispose();
});

test("organization keys isolate drafts and late save/close callbacks cannot update an unmounted catalog", async () => {
  const controller = await loadController("old-team");
  controller.render().content.onCreate();
  const view = controller.render();
  assert.equal(controller.shell().key, "old-team");
  assert.notEqual(controller.shell("new-team").key, controller.shell().key);
  assert.equal(controller.shell("team /?β").key, "team /?β");
  controller.dispose();
  view.dialog.props.onSaved(project); view.dialog.props.onClose();
  assert.equal(controller.retries, 0);
  assert.equal(controller.lateStateWrites, 0);
  const destination = await loadController("new-team");
  const next = destination.render();
  assert.equal(next.content.search, ""); assert.equal(next.content.sort, "updated");
  assert.equal(next.content.projects, null); assert.equal(next.dialog.props.open, false);
  assert.deepEqual(destination.dependencies.at(-1), ["new-team"]);
  destination.dispose();
});

test("real resource unmount aborts the catalog request and suppresses late success or failure", async () => {
  for (const outcome of ["success", "failure"] as const) {
    const controller = await loadController("old-team", true);
    let resolve!: (projects: SecretProject[]) => void; let reject!: (error: Error) => void;
    controller.setProjectsResult(() => new Promise((finish, fail) => { resolve = finish; reject = fail; }));
    const view = controller.render();
    assert.equal(view.content.loading, true); assert.equal(view.content.refreshing, true);
    assert.equal(controller.calls.length, 1);
    const signal = controller.calls[0].signal;
    assert.equal(signal.aborted, false);
    controller.dispose(); assert.equal(signal.aborted, true);
    if (outcome === "success") resolve([project]); else reject(new Error("Late old-team failure"));
    await settle();
    assert.equal(controller.lateStateWrites, 0);
    assert.equal(controller.retries, 0);
    const destination = await loadController("new-team", true);
    destination.render(); await settle();
    const next = destination.render();
    assert.deepEqual(next.content.projects, [project]);
    assert.equal(next.content.error, null); assert.equal(next.content.loading, false);
    assert.equal(destination.calls[0].orgSlug, "new-team");
    destination.dispose();
  }
});

test("real catalog content wires Arc search/sort and every recoverable create/retry/clear control", async () => {
  const source = await readFile(new URL("../src/components/secrets/vaults-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const Button = () => null; const SearchField = () => null; const Select = () => null; const Placeholder = () => null;
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return { useMemo: (callback: () => unknown) => callback() };
      if (specifier === "@tanstack/react-router") return { Link: Placeholder };
      if (specifier === "lucide-react") return { ArrowRight: Placeholder, FolderKey: Placeholder, Layers: Placeholder, LockKeyhole: Placeholder, Plus: Placeholder, RefreshCw: Placeholder, Search: Placeholder };
      if (specifier === "../arc/button/button") return { Button };
      if (specifier === "../arc/search-field/search-field") return { SearchField };
      if (specifier === "../arc/select/select") return { Select };
      if (specifier === "./overview-data") return overviewData;
      if (specifier === "./utils") return utils;
      if (specifier.endsWith(".css")) return {};
      throw new Error(`Unexpected vault catalog content dependency: ${specifier}`);
    },
  });
  const searches: string[] = []; const sorts: string[] = []; let creates = 0; let retries = 0;
  const props: VaultsContentProps = {
    orgSlug: "acme", projects: [project], loading: false, refreshing: false, error: null, search: "", sort: "updated",
    onSearchChange: (value) => searches.push(value), onSortChange: (value) => sorts.push(value),
    onCreate: () => { creates++; }, onRetry: () => { retries++; },
  };
  function collect(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(collect);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>;
    return [element, ...collect(element.props.children)];
  }
  function renderContent(next: Partial<VaultsContentProps> = {}) {
    return collect(module.exports.VaultsContent({ ...props, ...next }));
  }
  function click(elements: React.ReactElement<any>[], label: string) {
    const button = elements.find((element) => element.type === Button && React.Children.toArray(element.props.children).includes(label));
    assert.ok(button, `actual content exposes the ${label} button`);
    button.props.onClick();
  }
  const elements = renderContent();
  const search = elements.find((element) => element.type === SearchField);
  const sort = elements.find((element) => element.type === Select);
  assert.ok(search); assert.ok(sort);
  assert.equal(search.props.label, "Search vaults"); assert.equal(search.props.onValueChange, props.onSearchChange);
  search.props.onValueChange("  user draft  ");
  assert.equal(sort.props.label, "Sort vaults"); assert.equal(sort.props.value, "updated");
  assert.deepEqual(Array.from(sort.props.options, (option: { value: string }) => option.value), ["updated", "name"]);
  sort.props.onValueChange("name"); sort.props.onValueChange("updated"); sort.props.onValueChange("unsupported");
  assert.deepEqual(sorts, ["name", "updated", "updated"], "the sort adapter admits only supported values");
  click(elements, "New vault");
  click(renderContent({ projects: [] }), "Create vault");
  assert.equal(creates, 2);
  click(renderContent({ projects: null, error: "Initial failure" }), "Try again");
  click(renderContent({ error: "Refresh failure" }), "Retry");
  assert.equal(retries, 2);
  click(renderContent({ search: "unmatched" }), "Clear search");
  assert.deepEqual(searches, ["  user draft  ", ""]);
});
