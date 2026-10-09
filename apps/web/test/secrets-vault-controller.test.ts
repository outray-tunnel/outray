import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { isRedirect, redirect } from "@tanstack/react-router";
import ts from "typescript";
import type { SecretEnvironment, SecretProject } from "../src/lib/secrets-client";
import type { VaultContentProps } from "../src/components/secrets/vault-content";

const staging: SecretEnvironment = {
  id: "env-staging", name: "Staging", slug: "staging", description: "Preview configuration", color: "violet",
  secretCount: 3, revision: 7, isProduction: false, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
const production: SecretEnvironment = { ...staging, id: "env-production", name: "Production", slug: "production", isProduction: true };
const project: SecretProject = {
  id: "vault-api", name: "API", slug: "api", description: "Application credentials", environments: [staging, production],
  environmentCount: 2, secretCount: 6, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
type Props = { children?: React.ReactNode; [key: string]: any };
type Scope = { values: any[]; index: number; dirty: boolean; disposed: boolean; lateWrites: number;
  effects: Array<{ slot: number; callback: () => void | (() => void); deps: unknown[] }>;
  committed: Map<number, { deps: unknown[]; cleanup?: () => void }> };
const scope = (): Scope => ({ values: [], index: 0, dirty: false, disposed: false, lateWrites: 0, effects: [], committed: new Map() });
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
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
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Exercise actual workspace and form hooks, with separate persistent component scopes and transport doubles. */
async function controller(orgSlug = "acme", projectSlug = "api") {
  const [workspaceSource, dialogSource, environmentSource, canonicalSource, legacySource] = await Promise.all([
    readFile(new URL("../src/components/secrets/vault-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/secrets/secret-dialogs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/secrets/environment-dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/$orgSlug/secrets/vaults_.$projectSlug.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/$orgSlug/secrets/projects_.$projectSlug.tsx", import.meta.url), "utf8"),
  ]);
  const workspaceScope = scope(), projectScope = scope(), createScope = scope(), editScope = scope();
  let confirmScope = scope(), confirmKey: string | null = null, currentScope = workspaceScope;
  let result = { data: null as SecretProject | null, loading: true, refreshing: true, error: null as string | null };
  let loader: ((signal: AbortSignal) => Promise<SecretProject>) | undefined;
  let retries = 0;
  const dependencies: string[][] = [];
  const reads: Array<{ orgSlug: string; projectSlug: string; signal: AbortSignal }> = [];
  const mutations: Array<{ action: string; orgSlug: string; projectSlug: string; environmentSlug?: string; input: any }> = [];
  const navigations: Array<{ to: string; params: Record<string, string> }> = [];
  let readResult = async () => project;
  let deleteResult: () => Promise<void> = async () => undefined;
  let savedProject = project;
  const Content = (_props: Props) => null, Dialog = (_props: Props) => null, Form = (_props: Props) => null, Field = (_props: Props) => null;
  const Button = (_props: Props) => null, Production = (_props: Props) => null, Notice = (_props: Props) => null, Placeholder = (_props: Props) => null;
  const EnvironmentContent = (_props: Props) => null;
  const equal = (left: unknown[], right: unknown[]) => left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    ...React,
    useState(initial: any) {
      const active = currentScope, slot = active.index++;
      if (!(slot in active.values)) active.values[slot] = typeof initial === "function" ? initial() : initial;
      return [active.values[slot], (next: any) => {
        if (active.disposed) active.lateWrites++;
        const value = typeof next === "function" ? next(active.values[slot]) : next;
        if (!Object.is(value, active.values[slot])) { active.values[slot] = value; active.dirty = true; }
      }];
    },
    useRef(initial: any) { const slot = currentScope.index++; return currentScope.values[slot] ?? (currentScope.values[slot] = { current: initial }); },
    useMemo(calculate: () => any, deps: unknown[]) {
      const slot = currentScope.index++, previous = currentScope.values[slot];
      if (!previous || !equal(previous.deps, deps)) currentScope.values[slot] = { deps: [...deps], value: calculate() };
      return currentScope.values[slot].value;
    },
    useEffect(callback: () => void | (() => void), deps: unknown[]) { currentScope.effects.push({ callback, deps, slot: currentScope.index++ }); },
  };
  const client = {
    project: async (orgSlug: string, projectSlug: string, signal: AbortSignal) => { reads.push({ orgSlug, projectSlug, signal }); return readResult(); },
    updateProject: async (orgSlug: string, projectSlug: string, input: any) => {
      mutations.push({ action: "updateProject", orgSlug, projectSlug, input: { ...input } }); return savedProject;
    },
    createEnvironment: async (orgSlug: string, projectSlug: string, input: any) => {
      mutations.push({ action: "createEnvironment", orgSlug, projectSlug, input: { ...input } }); return staging;
    },
    updateEnvironment: async (orgSlug: string, projectSlug: string, environmentSlug: string, input: any) => {
      mutations.push({ action: "updateEnvironment", orgSlug, projectSlug, environmentSlug, input: { ...input } }); return staging;
    },
    deleteEnvironment: async (orgSlug: string, projectSlug: string, environmentSlug: string, input: any) => {
      mutations.push({ action: "deleteEnvironment", orgSlug, projectSlug, environmentSlug, input: { ...input } }); return deleteResult();
    },
    deleteProject: async (orgSlug: string, projectSlug: string, input: any) => {
      mutations.push({ action: "deleteProject", orgSlug, projectSlug, input: { ...input } }); return deleteResult();
    },
  };
  function evaluate(source: string, require: (specifier: string) => any) {
    const module = { exports: {} as any };
    runInNewContext(compile(source), { React, module, exports: module.exports, require, Error });
    return module.exports;
  }
  const environmentController = evaluate(environmentSource, (specifier) => {
    if (specifier === "react") return hooks;
    if (specifier === "../arc/dialog/dialog") return { Dialog, DialogContent: Dialog };
    if (specifier === "./environment-form-content") return { EnvironmentFormContent: EnvironmentContent };
    if (specifier.endsWith(".css")) return { dialog: "environment-dialog" };
    if (specifier === "@/lib/secrets-client") return { secretsClient: client };
    throw new Error(`Unexpected environment controller dependency: ${specifier}`);
  });
  const dialogs = evaluate(dialogSource, (specifier) => {
    if (specifier.endsWith("ui/workspace-input")) return { WorkspaceInput: "input", WorkspaceTextarea: "textarea" };
    if (specifier === "react") return hooks;
    if (specifier === "@/lib/secrets-client") return { secretsClient: client };
    if (specifier === "./environment-dialog") return environmentController;
    if (specifier === "../arc/button/button") return { Button };
    if (specifier === "./secrets-ui") return { SecretsDialog: Dialog, DialogForm: Form, Field, SecretsButton: Button, ProductionConfirmation: Production, SecretsNotice: Notice, SecretsBadge: Placeholder, fieldClassName: "field", textareaClassName: "textarea" };
    if (specifier.startsWith("@hugeicons") || specifier.startsWith("@outray/icons/")) return { HugeiconsIcon: Placeholder };
    throw new Error(`Unexpected vault dialog dependency: ${specifier}`);
  });
  const navigate = (next: { to: string; params: Record<string, string> }) => { navigations.push(next); return Promise.resolve(); };
  const workspace = evaluate(workspaceSource, (specifier) => {
    if (specifier === "react") return hooks;
    if (specifier === "@tanstack/react-router") return { useNavigate: () => navigate };
    if (specifier === "./secret-dialogs") return dialogs;
    if (specifier === "./vault-content") return { VaultContent: Content };
    if (specifier === "./use-secrets-resource") return { useSecretsResource: (next: typeof loader, deps: string[]) => {
      loader = next; dependencies.push(Array.from(deps)); return { ...result, reload: () => { retries++; } };
    } };
    if (specifier === "@/lib/secrets-client") return { secretsClient: client };
    throw new Error(`Unexpected vault workspace dependency: ${specifier}`);
  });
  let routeParams = { orgSlug, projectSlug };
  const routeRequire = (specifier: string) => {
    if (specifier === "@tanstack/react-router") return { redirect, createFileRoute: (id: string) => (options: Props) => ({ id, options, useParams: () => routeParams }) };
    if (specifier.endsWith("/vault-workspace")) return workspace;
    throw new Error(`Unexpected vault route dependency: ${specifier}`);
  };
  const canonical = evaluate(canonicalSource, routeRequire), legacy = evaluate(legacySource, routeRequire);
  function renderComponent(component: (props: any) => React.ReactNode, props: Props, active: Scope) {
    let root: React.ReactNode;
    for (let pass = 0; pass < 20; pass++) {
      currentScope = active; active.index = 0; active.dirty = false; active.effects = [];
      root = component(props);
      if (!active.dirty) active.effects.forEach((effect) => {
        const previous = active.committed.get(effect.slot);
        if (previous && equal(previous.deps, effect.deps)) return;
        previous?.cleanup?.(); active.committed.set(effect.slot, { deps: [...effect.deps], cleanup: effect.callback() ?? undefined });
      });
      if (!active.dirty) return elements(root);
      assert.ok(pass < 19, "real form/workspace state must settle without a render loop");
    }
    throw new Error("unreachable render loop");
  }
  const disposeScope = (active: Scope) => { active.committed.forEach((effect) => effect.cleanup?.()); active.disposed = true; };
  function form(element: React.ReactElement<Props>, active: Scope) {
    const tree = renderComponent(element.type as (props: any) => React.ReactNode, element.props, active);
    const input = (label: string) => {
      const field = tree.find((item) => item.type === Field && item.props.label === label);
      assert.ok(field, `real form exposes ${label}`); return (field.props.children as React.ReactElement<Props>).props;
    };
    return { tree, input, submit: tree.find((item) => item.type === Form)?.props.onSubmit,
      production: tree.find((item) => item.type === Production)?.props,
      action: (label: string) => tree.find((item) => item.type === Button && text(item) === label)?.props };
  }
  function environmentForm(element: React.ReactElement<Props>, active: Scope) {
    const tree = renderComponent(element.type as (props: any) => React.ReactNode, element.props, active);
    const content = tree.find((item) => item.type === EnvironmentContent);
    assert.ok(content, "the real extracted controller supplies the environment form contract");
    return { content: content.props, submit: content.props.onSubmit };
  }
  return {
    reads, mutations, navigations, dependencies,
    get retries() { return retries; }, get lateWrites() { return workspaceScope.lateWrites; },
    setResult(next: Partial<typeof result>) { result = { ...result, ...next }; },
    readWith(next: typeof readResult) { readResult = next; }, deleteWith(next: typeof deleteResult) { deleteResult = next; },
    saveProjectAs(next: SecretProject) { savedProject = next; },
    load(signal = new AbortController().signal) { assert.ok(loader); return loader(signal); },
    shell(org = orgSlug, vault = projectSlug) { return workspace.VaultPageView({ orgSlug: org, projectSlug: vault }) as React.ReactElement<Props>; },
    canonical(org = orgSlug, vault = projectSlug) { routeParams = { orgSlug: org, projectSlug: vault }; return canonical.Route.options.component() as React.ReactElement<Props>; },
    legacy: legacy.Route, PageView: workspace.VaultPageView, legacyView: legacy.VaultPageView,
    render() {
      const tree = renderComponent(workspace.VaultWorkspace, { orgSlug, projectSlug }, workspaceScope);
      const content = tree.find((item) => item.type === Content), editProject = tree.find((item) => item.type === dialogs.ProjectDialog);
      const environmentDialogs = tree.filter((item) => item.type === dialogs.EnvironmentDialog);
      const confirm = tree.find((item) => item.type === dialogs.ConfirmSecretActionDialog);
      assert.ok(content); assert.ok(editProject); assert.equal(environmentDialogs.length, 2); assert.ok(confirm);
      if (confirmKey !== confirm.key) { disposeScope(confirmScope); confirmScope = scope(); confirmKey = confirm.key; }
      const confirmationWrapper = dialogs.ConfirmSecretActionDialog(confirm.props) as React.ReactElement<Props>;
      const confirmationContent = React.isValidElement<Props>(confirmationWrapper.props.children) ? confirmationWrapper.props.children : null;
      return { content: content.props as VaultContentProps, editProject, createEnvironment: environmentDialogs[0], editEnvironment: environmentDialogs[1], confirm,
        projectForm: form(editProject, projectScope), createForm: environmentForm(environmentDialogs[0], createScope), editForm: environmentForm(environmentDialogs[1], editScope),
        confirmForm: confirmationContent ? form(confirmationContent, confirmScope) : null };
    },
    dispose() { for (const active of [workspaceScope, projectScope, createScope, editScope, confirmScope]) disposeScope(active); },
  };
}
const submitEvent = { preventDefault() {} };

test("vault loading is metadata-only, signal-aware and scoped; unavailable or mismatched data cannot open mutations", async () => {
  const view = await controller("team/?β", "api");
  let rendered = view.render();
  assert.equal(rendered.content.project, null); assert.equal(rendered.content.loading, true);
  rendered.content.onCreateEnvironment(); rendered.content.onEditVault(); rendered.content.onDeleteVault();
  rendered = view.render(); assert.equal(rendered.createEnvironment.props.open, false); assert.equal(rendered.editProject.props.open, false); assert.equal(rendered.confirm.props.open, false);
  const signal = new AbortController().signal;
  assert.equal(await view.load(signal), project);
  assert.deepEqual(view.reads, [{ orgSlug: "team/?β", projectSlug: "api", signal }]);
  assert.deepEqual(view.dependencies.at(-1), ["team/?β", "api"]);
  assert.equal(view.mutations.length, 0);
  const cancellation = new AbortController(); view.readWith(async () => { cancellation.abort(); return project; });
  await assert.rejects(view.load(cancellation.signal), { name: "AbortError" });
  view.setResult({ data: { ...project, slug: "different-vault" }, loading: false, refreshing: false, error: "Vault unavailable" });
  rendered = view.render(); assert.equal(rendered.content.project, null); assert.equal(rendered.content.error, "Vault unavailable");
  rendered.content.onRetry(); assert.equal(view.retries, 1); view.dispose();
});

test("visible metadata and search refresh independently of captured edit-vault snapshots and real unsaved drafts", async () => {
  const view = await controller(); view.setResult({ data: project, loading: false, refreshing: false });
  view.render().content.onSearchChange("  staging draft  "); view.render().content.onEditVault();
  let rendered = view.render();
  rendered.projectForm.input("Vault name").onChange({ target: { value: "Unsaved name" } });
  rendered.projectForm.input("Slug").onChange({ target: { value: "custom-api" } });
  rendered.projectForm.input("Description").onChange({ target: { value: "Unsaved description" } });
  const updated = { ...project, name: "Fresh server metadata" };
  view.setResult({ data: updated, refreshing: true }); rendered = view.render();
  assert.equal(rendered.content.project, updated); assert.equal(rendered.content.search, "  staging draft  ");
  assert.equal(rendered.editProject.props.project, project);
  assert.deepEqual([rendered.projectForm.input("Vault name").value, rendered.projectForm.input("Slug").value, rendered.projectForm.input("Description").value], ["Unsaved name", "custom-api", "Unsaved description"]);
  view.setResult({ error: "Refresh failed", refreshing: false }); rendered = view.render();
  assert.equal(rendered.content.error, "Refresh failed"); assert.equal(rendered.editProject.props.open, true);
  assert.equal(rendered.projectForm.input("Vault name").value, "Unsaved name");
  rendered.editProject.props.onClose(); assert.equal(view.render().editProject.props.open, false); assert.equal(view.retries, 0); view.dispose();
});

test("add and edit environment forms retain drafts and captured revision/production confirmation through metadata reloads", async () => {
  const view = await controller(); view.setResult({ data: project, loading: false, refreshing: false });
  view.render().content.onCreateEnvironment(); let rendered = view.render();
  rendered.createForm.content.onNameChange("Sandbox");
  rendered.createForm.content.onDescriptionChange("Draft sandbox");
  view.setResult({ data: { ...project, environments: [] }, refreshing: true }); rendered = view.render();
  assert.equal(rendered.createForm.content.name, "Sandbox");
  rendered.createForm.submit(submitEvent); await settle(); rendered = view.render();
  assert.equal(view.mutations[0].action, "createEnvironment");
  assert.deepEqual(view.mutations[0].input, { name: "Sandbox", slug: "sandbox", description: "Draft sandbox", confirmation: "Sandbox", confirmProduction: false });
  assert.equal(rendered.createEnvironment.props.open, false); assert.equal(view.retries, 1);
  view.setResult({ data: project }); view.render().content.onEditEnvironment(production); rendered = view.render();
  rendered.editForm.content.onNameChange("Renamed production");
  rendered.editForm.content.onConfirmationChange("Production");
  rendered.editForm.content.onProductionChange(true);
  view.setResult({ data: { ...project, environments: [{ ...production, name: "Updated server name", revision: 99 }] }, refreshing: false, error: "Refresh failed" }); rendered = view.render();
  assert.equal(rendered.editEnvironment.props.environment, production);
  assert.equal(rendered.editForm.content.name, "Renamed production");
  assert.equal(rendered.editForm.content.productionConfirmed, true);
  rendered.editForm.submit(submitEvent); await settle();
  assert.deepEqual(view.mutations[1], { action: "updateEnvironment", orgSlug: "acme", projectSlug: "api", environmentSlug: "production", input: {
    name: "Renamed production", slug: "production", description: production.description, confirmation: "Production", confirmProduction: true, expectedRevision: 7,
  } });
  assert.equal(view.retries, 2); assert.equal(view.render().editEnvironment.props.open, false); view.dispose();
});

test("editing a vault reloads the same scope or navigates to its returned canonical slug without inventing metadata", async () => {
  for (const slug of ["api", "renamed-api"]) {
    const view = await controller("org/team"); view.setResult({ data: project, loading: false, refreshing: false });
    view.render().content.onEditVault(); let rendered = view.render();
    rendered.projectForm.input("Vault name").onChange({ target: { value: "  Saved API  " } });
    view.saveProjectAs({ ...project, name: "Saved API", slug }); rendered = view.render();
    await rendered.projectForm.submit(submitEvent); rendered = view.render();
    assert.equal(view.mutations[0].action, "updateProject"); assert.equal(view.mutations[0].orgSlug, "org/team");
    assert.equal(view.mutations[0].input.name, "Saved API");
    assert.equal(rendered.content.project, project); assert.equal(rendered.editProject.props.open, false);
    if (slug === "api") { assert.equal(view.retries, 1); assert.equal(view.navigations.length, 0); }
    else { assert.equal(view.retries, 0); assert.deepEqual(view.navigations.map((next) => ({ to: next.to, params: { ...next.params } })), [{ to: "/$orgSlug/secrets/vaults/$projectSlug", params: { orgSlug: "org/team", projectSlug: slug } }]); }
    view.dispose();
  }
});

test("environment deletion enforces captured exact name/production, blocks duplicate submits and dismissal, and preserves failure inputs", async () => {
  const view = await controller(); view.setResult({ data: project, loading: false, refreshing: false });
  view.render().content.onDeleteEnvironment(production); let rendered = view.render();
  assert.match(rendered.confirm.props.description, /Trash/);
  rendered.confirm.props.onConfirm(false, "Production"); rendered.confirm.props.onConfirm(true, "production");
  assert.equal(view.mutations.length, 0);
  rendered.confirmForm!.input("Type Production to continue").onChange({ target: { value: "Production" } });
  rendered.confirmForm!.production!.onChange(true); rendered = view.render();
  const pending = deferred<void>(); view.deleteWith(() => pending.promise);
  rendered.confirmForm!.action("Delete environment")!.onClick(); rendered.confirm.props.onConfirm(true, "Production");
  assert.equal(view.mutations.length, 1); rendered = view.render(); assert.equal(rendered.confirm.props.loading, true);
  rendered.confirm.props.onClose(); rendered.content.onDeleteVault();
  view.setResult({ data: { ...project, environments: [{ ...production, name: "Fresh name", isProduction: false }] }, refreshing: true });
  rendered = view.render(); assert.equal(rendered.confirm.props.confirmationText, "Production"); assert.equal(rendered.confirm.props.production, true);
  pending.reject(new Error("Deletion failed")); await settle(); rendered = view.render();
  assert.equal(rendered.confirm.props.open, true); assert.equal(rendered.confirm.props.error, "Deletion failed"); assert.equal(rendered.confirm.props.loading, false);
  assert.ok(rendered.confirmForm!.tree.some((item) => item.props.role === "alert" && text(item) === "Deletion failed"));
  assert.equal(rendered.confirmForm!.input("Type Production to continue").value, "Production"); assert.equal(rendered.confirmForm!.production?.checked, true);
  view.deleteWith(async () => undefined); rendered.confirmForm!.action("Delete environment")!.onClick(); await settle();
  assert.equal(view.render().confirm.props.open, false); assert.equal(view.retries, 1); assert.equal(view.navigations.length, 0);
  assert.deepEqual(view.mutations.map((item) => ({ ...item, input: { ...item.input } })), Array.from({ length: 2 }, () => ({ action: "deleteEnvironment", orgSlug: "acme", projectSlug: "api", environmentSlug: "production", input: { confirmation: "Production", confirmProduction: true } })));
  view.dispose();
});

test("vault deletion captures all production environments and routes successful removal to the canonical organization catalog", async () => {
  const view = await controller("org/team"); view.setResult({ data: project, loading: false, refreshing: false });
  view.render().content.onDeleteVault(); let rendered = view.render(); const originalKey = rendered.confirm.key;
  view.setResult({ data: { ...project, name: "Changed vault", environments: [staging] }, refreshing: true }); rendered = view.render();
  assert.equal(rendered.confirm.key, originalKey); assert.equal(rendered.confirm.props.confirmationText, "API"); assert.equal(rendered.confirm.props.production, true);
  rendered.confirm.props.onConfirm(false, "API"); rendered.confirm.props.onConfirm(true, "Changed vault"); assert.equal(view.mutations.length, 0);
  view.deleteWith(async () => { throw "failed"; }); rendered.confirm.props.onConfirm(true, "API"); await settle(); rendered = view.render();
  assert.equal(rendered.confirm.props.open, true); assert.equal(rendered.confirm.props.error, "Could not delete vault.");
  view.deleteWith(async () => undefined); rendered.confirm.props.onConfirm(true, "API"); await settle();
  assert.equal(view.render().confirm.props.open, false); assert.equal(view.retries, 0);
  assert.deepEqual(view.navigations.map((item) => ({ to: item.to, params: { ...item.params } })), [{ to: "/$orgSlug/secrets/vaults", params: { orgSlug: "org/team" } }]);
  view.dispose();
});

test("org/vault keys isolate local state and late saves, delete responses, and callbacks cannot write or navigate after unmount", async () => {
  for (const target of ["environment", "project"] as const) for (const outcome of ["success", "error"] as const) {
    const view = await controller("old-org"); view.setResult({ data: project, loading: false, refreshing: false });
    view.render().content.onSearchChange("old draft"); view.render().content.onEditVault(); view.render().content.onEditEnvironment(staging);
    const saved = view.render();
    assert.equal(view.shell().key, JSON.stringify(["old-org", "api"]));
    assert.notEqual(view.shell("new-org").key, view.shell().key); assert.notEqual(view.shell("old-org", "other-vault").key, view.shell().key);
    if (target === "environment") saved.content.onDeleteEnvironment(staging); else saved.content.onDeleteVault();
    const pending = deferred<void>(); view.deleteWith(() => pending.promise);
    const confirmation = view.render(); confirmation.confirm.props.onConfirm(true, target === "environment" ? "Staging" : "API");
    view.dispose();
    saved.editProject.props.onSaved({ ...project, slug: "renamed-vault" }); saved.editProject.props.onClose();
    saved.createEnvironment.props.onSaved(staging); saved.createEnvironment.props.onClose(); saved.editEnvironment.props.onSaved(staging); saved.editEnvironment.props.onClose();
    saved.content.onRetry(); saved.content.onSearchChange("late"); saved.content.onCreateEnvironment(); saved.content.onEditVault(); saved.content.onEditEnvironment(staging);
    confirmation.confirm.props.onClose(); confirmation.confirm.props.onConfirm(true, target === "environment" ? "Staging" : "API");
    if (outcome === "success") pending.resolve(); else pending.reject(new Error("Late error")); await settle();
    assert.equal(view.mutations.length, 1); assert.equal(view.retries, 0); assert.equal(view.navigations.length, 0); assert.equal(view.lateWrites, 0);
  }
  const destination = await controller("new-org"); const rendered = destination.render();
  assert.equal(rendered.content.project, null); assert.equal(rendered.content.search, ""); assert.equal(rendered.editProject.props.open, false); assert.equal(rendered.confirm.props.open, false); destination.dispose();
});

test("canonical vault pages use the extracted view and legacy links preserve scope in a replace redirect", async () => {
  const view = await controller("team/?β", "vault/?β");
  const canonical = view.canonical(); assert.equal(canonical.type, view.PageView); assert.equal(view.legacyView, view.PageView);
  assert.deepEqual({ ...canonical.props }, { orgSlug: "team/?β", projectSlug: "vault/?β" });
  assert.equal(view.legacy.id, "/$orgSlug/secrets/projects_/$projectSlug");
  assert.throws(() => view.legacy.options.beforeLoad({ params: { orgSlug: "team/?β", projectSlug: "vault/?β" } }), (error: any) => {
    assert.equal(isRedirect(error), true); assert.equal(error.options.to, "/$orgSlug/secrets/vaults/$projectSlug");
    assert.deepEqual({ ...error.options.params }, { orgSlug: "team/?β", projectSlug: "vault/?β" }); assert.equal(error.options.replace, true); return true;
  });
  view.dispose();
});
