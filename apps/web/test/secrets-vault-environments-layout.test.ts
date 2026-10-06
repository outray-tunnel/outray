import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createFileRoute, createMemoryHistory, createRootRoute, createRouter, isRedirect, Outlet, redirect, RouterProvider, useParams } from "@tanstack/react-router";
import ts from "typescript";
import type { EnvironmentKeysContentProps } from "../src/components/secrets/environment-keys-content";
import type { SecretProject } from "../src/lib/secrets-client";

const parentId = "/$orgSlug/secrets/vaults_/$projectSlug_/environments";
const childId = `${parentId}/$environmentSlug`;
const canonicalPath = "/$orgSlug/secrets/vaults/$projectSlug/environments/$environmentSlug";
const legacyId = "/$orgSlug/secrets/projects_/$projectSlug_/environments_/$environmentSlug";
const project: SecretProject = {
  id: "vault-api", name: "API", slug: "api", description: "Application credentials",
  environments: [
    { id: "env-staging", name: "Staging", slug: "staging", secretCount: 1, revision: 7, isProduction: false, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z" },
    { id: "env-production", name: "Production", slug: "production", secretCount: 2, revision: 8, isProduction: true, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z" },
  ],
  environmentCount: 2, secretCount: 3, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
type Props = { children?: React.ReactNode; [key: string]: any };
type Effect = { run: () => void | (() => void); deps: unknown[]; slot: number };
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
const source = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
function evaluate(code: string, require: (specifier: string) => any, extra: Record<string, unknown> = {}) {
  const module = { exports: {} as any };
  runInNewContext(compile(code), { React, module, exports: module.exports, require, Error, DOMException, AbortController, ...extra });
  return module.exports;
}
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Execute the generated graph with real TanStack routes, without loading any app, API or database modules. */
async function generatedGraph(parentComponent?: React.ComponentType, initialEntry = "/acme/secrets/vaults/api/environments/staging") {
  const imports = new Map<string, any>();
  const { routeTree } = evaluate(await source("routeTree.gen.ts"), (specifier) => {
    assert.ok(specifier.startsWith("./routes/"), `unexpected generated dependency: ${specifier}`);
    if (!imports.has(specifier)) imports.set(specifier, {
      Route: specifier === "./routes/__root" ? createRootRoute({}) : createFileRoute(specifier as never)({
        component: specifier === "./routes/$orgSlug/secrets/vaults_.$projectSlug_.environments" ? parentComponent : undefined,
      }),
    });
    return imports.get(specifier);
  });
  return createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [initialEntry] }), isServer: true });
}

/** Keep the real shared layout and resource hooks mounted while changing only the leaf route's params. */
async function layoutController(initialEnvironment = "staging") {
  let params = { orgSlug: "acme", projectSlug: "api", environmentSlug: initialEnvironment };
  const values: any[] = [];
  const committed = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  let index = 0, dirty = false, effects: Effect[] = [];
  const equal = (left: unknown[], right: unknown[]) => left.length === right.length && left.every((value, slot) => Object.is(value, right[slot]));
  const memo = (calculate: () => unknown, deps: unknown[]) => {
    const slot = index++;
    if (!values[slot] || !equal(values[slot].deps, deps)) values[slot] = { deps: [...deps], value: calculate() };
    return values[slot].value;
  };
  const hooks = {
    ...React,
    useState(initial: any) {
      const slot = index++;
      if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
      return [values[slot], (next: any) => {
        const value = typeof next === "function" ? next(values[slot]) : next;
        if (!Object.is(value, values[slot])) { values[slot] = value; dirty = true; }
      }];
    },
    useRef(initial: any) { const slot = index++; return values[slot] ?? (values[slot] = { current: initial }); },
    useMemo: memo,
    useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
    useEffect(run: Effect["run"], deps: unknown[]) { effects.push({ run, deps, slot: index++ }); },
  };
  const calls: Array<{ orgSlug: string; projectSlug: string; signal: AbortSignal }> = [];
  let response: () => Promise<SecretProject> = async () => project;
  const resource = evaluate(await source("components/secrets/use-secrets-resource.ts"), (specifier) => {
    assert.equal(specifier, "react"); return hooks;
  });
  const Context = { Provider: (_props: Props) => null };
  const Outlet = () => null;
  const Button = (_props: Props) => null;
  const Icon = (_props: Props) => null;
  const portals: Array<{ children: React.ReactNode; target: unknown }> = [];
  const content = evaluate(await source("components/secrets/environment-keys-content.tsx"), (specifier) => {
    if (specifier === "react-dom") return { createPortal(children: React.ReactNode, target: unknown) {
      portals.push({ children, target }); return React.createElement("portal-placeholder", null, children);
    } };
    if (specifier === "@tanstack/react-router") return { Link: (_props: Props) => null };
    if (specifier === "lucide-react") return { ArrowLeft: Icon, Download: Icon, Layers: Icon, LockKeyhole: Icon, Plus: Icon, RefreshCw: Icon, Upload: Icon };
    if (specifier === "../arc/button/button") return { Button };
    if (specifier.endsWith(".css")) return {};
    throw new Error(`Unexpected keys content dependency: ${specifier}`);
  });
  const layout = evaluate(await source("components/secrets/vault-environments-layout.tsx"), (specifier) => {
    if (specifier === "react") return hooks;
    if (specifier === "@tanstack/react-router") return { Outlet, useParams: () => params };
    if (specifier === "lucide-react") return { Layers: Icon, RefreshCw: Icon };
    if (specifier === "../arc/button/button") return { Button };
    if (specifier === "./environment-keys-content") return content;
    if (specifier === "./use-secrets-resource") return resource;
    if (specifier === "./vault-environments-context") return { VaultEnvironmentsContext: Context };
    if (specifier === "@/lib/secrets-client") return { secretsClient: { project: (orgSlug: string, projectSlug: string, signal: AbortSignal) => {
      calls.push({ orgSlug, projectSlug, signal }); return response();
    } } };
    throw new Error(`Unexpected shared layout dependency: ${specifier}`);
  });
  const workspace = evaluate(await source("components/secrets/environment-keys-workspace.tsx"), (specifier) => {
    if (specifier === "react") return hooks;
    if (specifier === "./secret-dialogs") return {};
    if (specifier === "./environment-keys-content") return content;
    if (specifier === "./secrets-table") return {};
    if (specifier === "./use-secrets-resource") return resource;
    if (specifier === "@/lib/secrets-client") return {};
    throw new Error(`Unexpected workspace wrapper dependency: ${specifier}`);
  });
  let activeContext: any = null;
  const routeRequire = (specifier: string) => {
    if (specifier === "@tanstack/react-router") return { createFileRoute: (id: string) => (options: Props) => ({ id, options, useParams: () => params }) };
    if (specifier.endsWith("/vault-environments-layout")) return layout;
    if (specifier.endsWith("/environment-keys-workspace")) return workspace;
    if (specifier.endsWith("/vault-environments-context")) return { useVaultEnvironmentsLayout: () => {
      assert.ok(activeContext, "the leaf cannot bypass the shared metadata provider"); return activeContext;
    } };
    throw new Error(`Unexpected environment route dependency: ${specifier}`);
  };
  const parent = evaluate(await source("routes/$orgSlug/secrets/vaults_.$projectSlug_.environments.tsx"), routeRequire);
  const child = evaluate(await source("routes/$orgSlug/secrets/vaults_.$projectSlug_.environments.$environmentSlug.tsx"), routeRequire);
  function render(environmentSlug = params.environmentSlug) {
    params = { ...params, environmentSlug };
    let frame!: React.ReactElement<Props>;
    for (let pass = 0; pass < 10; pass++) {
      index = 0; dirty = false; effects = [];
      frame = layout.VaultEnvironmentsLayout({ orgSlug: params.orgSlug, projectSlug: params.projectSlug });
      effects.forEach((effect) => {
        const previous = committed.get(effect.slot);
        if (previous && equal(previous.deps, effect.deps)) return;
        previous?.cleanup?.();
        committed.set(effect.slot, { deps: [...effect.deps], cleanup: effect.run() ?? undefined });
      });
      if (!dirty) break;
      assert.ok(pass < 9, "shared layout state settles without a render loop");
    }
    const provider = elements(frame).find((element) => element.type === Context.Provider);
    activeContext = provider?.props.value ?? null;
    const leaf = activeContext && environmentSlug ? child.Route.options.component() as React.ReactElement<Props> : null;
    return {
      frame, provider, context: activeContext, leaf,
      shell: parent.Route.options.component() as React.ReactElement<Props>,
      workspace: leaf ? workspace.VaultEnvironmentPageView(leaf.props) as React.ReactElement<Props> : null,
      tree: elements(layout.VaultEnvironmentsFrame(frame.props)),
    };
  }
  return {
    render, calls, portals, Button, Outlet, Context, content,
    setResponse(next: typeof response) { response = next; },
    shell(orgSlug = params.orgSlug, projectSlug = params.projectSlug) {
      const previous = params; params = { ...params, orgSlug, projectSlug };
      const shell = parent.Route.options.component() as React.ReactElement<Props>; params = previous; return shell;
    },
    renderActions(props: EnvironmentKeysContentProps) { portals.length = 0; return content.EnvironmentKeysContent(props) as React.ReactElement<Props>; },
    dispose() { committed.forEach((effect) => effect.cleanup?.()); },
  };
}

test("generated routes match direct environment URLs through the shared vault parent without changing the public path", async () => {
  const router = await generatedGraph();
  for (const environmentSlug of ["staging", "production", "deleted"]) {
    const matches = router.matchRoutes(`/acme/secrets/vaults/api/environments/${environmentSlug}`);
    assert.deepEqual(matches.map((match) => match.routeId), ["__root__", "/$orgSlug", "/$orgSlug/secrets", parentId, childId]);
    assert.deepEqual(matches.at(-1)?.params, { orgSlug: "acme", projectSlug: "api", environmentSlug });
    assert.deepEqual(matches.find((match) => match.routeId === parentId)?.params, { orgSlug: "acme", projectSlug: "api", environmentSlug }, "the parent match includes its descendant's active environment");
  }
  const route = router.routesById[childId];
  assert.equal(route.parentRoute, router.routesById[parentId]);
  assert.equal(route.path, "$environmentSlug");
  assert.equal(route.fullPath, canonicalPath);
  assert.equal(router.matchRoutes("/acme/secrets/vaults/api").at(-1)?.routeId, "/$orgSlug/secrets/vaults_/$projectSlug");
  assert.equal(router.matchRoutes("/acme/secrets/vaults/api/environments").at(-1)?.routeId, parentId);
  const encoded = router.matchRoutes("/team%2F%3F%CE%B2/secrets/vaults/api%2F%3F%CE%B2/environments/pre%2Fprod%3F%CE%B2").at(-1);
  assert.equal(encoded?.routeId, childId);
  assert.deepEqual(encoded?.params, { orgSlug: "team/?β", projectSlug: "api/?β", environmentSlug: "pre/prod?β" });
});

test("the real parent useParams hook reads descendant environmentSlug on a direct link and after sibling navigation", async () => {
  const observed: Array<{ orgSlug?: string; projectSlug?: string; environmentSlug?: string }> = [];
  function ParentProbe() {
    const params = useParams({ strict: false });
    observed.push({ ...params });
    return React.createElement(React.Fragment, null, React.createElement("output", null, params.environmentSlug), React.createElement(Outlet));
  }
  const router = await generatedGraph(ParentProbe, "/acme/secrets/vaults/api/environments/production");
  await router.load();
  assert.match(renderToStaticMarkup(React.createElement(RouterProvider, { router })), /<output>production<\/output>/);
  assert.deepEqual(observed.at(-1), { orgSlug: "acme", projectSlug: "api", environmentSlug: "production" });
  await router.navigate({ to: "/acme/secrets/vaults/api/environments/staging" });
  assert.match(renderToStaticMarkup(React.createElement(RouterProvider, { router })), /<output>staging<\/output>/);
  assert.deepEqual(observed.at(-1), { orgSlug: "acme", projectSlug: "api", environmentSlug: "staging" });
  await router.navigate({ to: "/acme/secrets/vaults/api/environments" });
  renderToStaticMarkup(React.createElement(RouterProvider, { router }));
  assert.deepEqual(observed.at(-1), { orgSlug: "acme", projectSlug: "api" }, "the bare parent has no accidental environment selection");
});

test("legacy project environment direct links remain redirects rather than another shared-layout branch", async () => {
  const router = await generatedGraph();
  assert.deepEqual(router.matchRoutes("/acme/secrets/projects/api/environments/staging").map((match) => match.routeId), ["__root__", "/$orgSlug", "/$orgSlug/secrets", legacyId]);
  const legacy = evaluate(await source("routes/$orgSlug/secrets/projects_.$projectSlug_.environments_.$environmentSlug.tsx"), (specifier) => {
    if (specifier === "@tanstack/react-router") return { createFileRoute, redirect };
    if (specifier.endsWith("/environment-keys-workspace")) return { VaultEnvironmentPageView: () => null };
    throw new Error(`Unexpected legacy route dependency: ${specifier}`);
  });
  const params = { orgSlug: "team/?β", projectSlug: "api/?β", environmentSlug: "pre/prod?β" };
  assert.throws(() => legacy.Route.options.beforeLoad({ params }), (error: any) => {
    assert.equal(isRedirect(error), true);
    assert.equal(error.options.to, canonicalPath);
    assert.deepEqual({ ...error.options.params }, params);
    assert.equal(error.options.replace, true);
    return true;
  });
});

test("the parent keeps metadata and its action slot mounted across tabs, while the leaf uses the complete scope key", async () => {
  const controller = await layoutController();
  let view = controller.render();
  assert.equal(view.frame.props.loading, true);
  assert.equal(view.provider, undefined);
  await settle(); view = controller.render();
  assert.equal(controller.calls.length, 1, "the shared parent loads vault metadata, not secrets, revision or plaintext");
  assert.equal(controller.calls[0].orgSlug, "acme"); assert.equal(controller.calls[0].projectSlug, "api");
  const actionsContainer = { slot: "persistent-header" };
  view.frame.props.actions.props.ref(actionsContainer); view = controller.render();
  const before = view;
  view = controller.render("production");
  assert.equal(controller.calls.length, 1, "switching environments does not refetch shared vault metadata");
  assert.equal(view.shell.key, before.shell.key);
  assert.equal(view.context, before.context, "environment changes leave the metadata provider and action target intact");
  assert.equal(view.context.actionsContainer, actionsContainer);
  assert.equal(view.frame.props.environmentSlug, "production");
  assert.equal(view.leaf?.props.project, project);
  assert.equal(view.leaf?.props.sharedLayout, true);
  assert.equal(view.leaf?.props.actionsContainer, actionsContainer);
  assert.equal(view.leaf?.props.onProjectMutated, view.context.reloadProject);
  assert.equal(before.workspace?.key, JSON.stringify(["acme", "api", "staging"]));
  assert.equal(view.workspace?.key, JSON.stringify(["acme", "api", "production"]));
  assert.notEqual(view.workspace?.key, before.workspace?.key, "secret dialogs, row selection and revealed values remount per environment");
  assert.notEqual(controller.shell("other-org").key, view.shell.key);
  assert.notEqual(controller.shell("acme", "other-vault").key, view.shell.key);
  controller.dispose(); assert.equal(controller.calls[0].signal.aborted, true);
});

test("retry and leaf mutations refresh only the parent's metadata while retaining the active vault frame", async () => {
  const controller = await layoutController("production"); controller.render(); await settle();
  let view = controller.render();
  const updated = { ...project, name: "Updated API" };
  controller.setResponse(async () => updated);
  view.leaf?.props.onProjectMutated(); view = controller.render();
  assert.equal(view.frame.props.project, project, "refresh never blanks the last available navigation");
  assert.equal(controller.calls.length, 2);
  assert.equal(controller.calls[0].signal.aborted, true);
  await settle(); view = controller.render();
  assert.equal(view.frame.props.project, updated);
  assert.equal(view.leaf?.props.project, updated);
  controller.setResponse(async () => { throw new Error("Metadata refresh failed"); });
  view.frame.props.onRetry(); controller.render(); await settle(); view = controller.render();
  assert.equal(view.frame.props.project, updated);
  assert.equal(view.frame.props.error, "Metadata refresh failed");
  assert.ok(view.tree.some((element) => element.props.role === "alert" && text(element).includes("Showing the last available list")));
  controller.dispose(); assert.equal(controller.calls.at(-1)?.signal.aborted, true);
});

test("direct parent links and failed vault loads avoid mounting an unscoped environment controller", async () => {
  const controller = await layoutController("");
  let view = controller.render();
  assert.equal(view.leaf, null); assert.equal(view.provider, undefined);
  await settle(); view = controller.render();
  assert.ok(view.provider);
  assert.equal(view.leaf, null);
  assert.equal(elements(view.provider).some((element) => element.type === controller.Outlet), false);
  assert.match(text(view.provider), /Choose an environment to view its secret keys/);
  controller.dispose();
  const failed = await layoutController("production");
  failed.setResponse(async () => { throw new Error("Vault access unavailable"); });
  failed.render(); await settle(); view = failed.render();
  assert.equal(view.frame.props.project, null);
  assert.equal(view.provider, undefined); assert.equal(view.leaf, null);
  assert.ok(view.tree.some((element) => element.props.role === "alert" && text(element).includes("Vault access unavailable")));
  const retry = view.tree.find((element) => element.type === failed.Button && text(element) === "Try again");
  assert.ok(retry); failed.setResponse(async () => project); retry.props.onClick(); failed.render(); await settle();
  assert.equal(failed.render().leaf?.props.environmentSlug, "production");
  failed.dispose();
});

test("the active leaf owns header actions in the persistent slot and clears them while its next metadata loads", async () => {
  const controller = await layoutController(); controller.render(); await settle();
  let view = controller.render();
  const slot = { slot: "header" };
  view.frame.props.actions.props.ref(slot); view = controller.render();
  const actions: string[] = [];
  const props: EnvironmentKeysContentProps = {
    orgSlug: "acme", projectSlug: "api", environmentSlug: "staging", sharedLayout: true, actionsContainer: view.context.actionsContainer,
    data: { project, environment: project.environments[0], secrets: [], revision: 7 }, loading: false, refreshing: false, error: null, actionError: null, exporting: false,
    onAdd: () => actions.push("staging:add"), onImport: () => actions.push("staging:import"), onExport: () => actions.push("staging:export"), onRetry: () => {},
  };
  let root = controller.renderActions(props);
  assert.equal(controller.portals.length, 1); assert.equal(controller.portals[0].target, slot);
  assert.equal(elements(root).filter((element) => element.type === controller.content.EnvironmentKeysHeader || element.type === controller.content.EnvironmentKeysTabs).length, 0, "the leaf does not duplicate persistent chrome");
  const add = elements(controller.portals[0].children).find((element) => element.type === controller.Button && text(element) === "Add secret");
  assert.ok(add); add.props.onClick(); assert.deepEqual(actions, ["staging:add"]);
  view = controller.render("production");
  controller.renderActions({ ...props, environmentSlug: "production", data: null, loading: true, actionsContainer: view.context.actionsContainer });
  assert.equal(controller.portals[0].target, slot); assert.equal(controller.portals[0].children, null, "an outgoing environment's actions are not kept alive by its parent");
  root = controller.renderActions({ ...props, environmentSlug: "production", actionsContainer: view.context.actionsContainer, data: { ...props.data!, environment: project.environments[1] }, onAdd: () => actions.push("production:add") });
  const productionAdd = elements(controller.portals[0].children).find((element) => element.type === controller.Button && text(element) === "Add secret");
  assert.ok(productionAdd); productionAdd.props.onClick(); assert.deepEqual(actions, ["staging:add", "production:add"]);
  controller.renderActions({ ...props, actionsContainer: null });
  assert.equal(controller.portals.length, 0, "unmounting the action ref never targets a stale detached slot");
  controller.dispose();
});
