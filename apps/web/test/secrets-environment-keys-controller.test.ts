import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import type { EnvironmentKeysContentProps, EnvironmentKeysData } from "../src/components/secrets/environment-keys-content";
import type { EnvironmentKeysWorkspaceProps } from "../src/components/secrets/environment-keys-workspace";
import type { SecretEnvironment, SecretMetadata, SecretProject } from "../src/lib/secrets-client";

const staging: SecretEnvironment = {
  id: "env-staging", name: "Staging", slug: "staging", description: "Pre-release configuration",
  color: "violet", secretCount: 1, revision: 17, isProduction: false,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
const production: SecretEnvironment = { ...staging, id: "env-production", name: "Production", slug: "production", isProduction: true };
const project: SecretProject = {
  id: "vault-api", name: "API", slug: "api", description: "Application credentials",
  environments: [staging, production], environmentCount: 2, secretCount: 2,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
const secret: SecretMetadata = {
  id: "secret-a", key: "API_KEY", version: 4, revision: 17,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z",
};
const snapshot: EnvironmentKeysData = { project, environment: staging, secrets: [secret], revision: 17 };
const productionSnapshot: EnvironmentKeysData = { ...snapshot, environment: production };
type Effect = { callback: () => void | (() => void); deps: unknown[] };
type SharedWorkspaceOptions = Pick<EnvironmentKeysWorkspaceProps, "project" | "sharedLayout" | "actionsContainer" | "onProjectMutated">;

/** Runs real workspace hooks while keeping transport, metadata and downloads deterministic. */
async function loadController(orgSlug = "acme", projectSlug = "api", environmentSlug = "staging", options: SharedWorkspaceOptions = {}) {
  const source = await readFile(new URL("../src/components/secrets/environment-keys-workspace.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  let result: { data: EnvironmentKeysData | null; loading: boolean; refreshing: boolean; error: string | null } = {
    data: null, loading: true, refreshing: true, error: null,
  };
  let loader: ((signal: AbortSignal) => Promise<EnvironmentKeysData>) | undefined;
  let projectResult: () => Promise<SecretProject> = async () => project;
  let secretsResult: () => Promise<SecretMetadata[]> = async () => [secret];
  let revisionResult: () => Promise<{ revision: number }> = async () => ({ revision: 17 });
  let exportResult: () => Promise<Blob> = async () => new Blob(["API_KEY=test-export"], { type: "text/plain" });
  let retries = 0; let index = 0; let dirty = false; let disposed = false; let lateStateWrites = 0; let timerId = 0;
  let clickError: Error | undefined;
  const values: any[] = [];
  let effects: Effect[] = [];
  const committed: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  const dependencies: string[][] = [];
  const metadataCalls: Array<{ type: "project" | "secrets" | "revision"; orgSlug: string; projectSlug: string; environmentSlug?: string; signal?: AbortSignal }> = [];
  const exports: Array<{ orgSlug: string; projectSlug: string; environmentSlug: string; input: { confirmation: string; confirmProduction: boolean } }> = [];
  const objectUrls: Array<{ url: string; blob: Blob }> = [];
  const revokedUrls: string[] = [];
  const downloads: Array<{ href: string; download: string; rel: string }> = [];
  const timers = new Map<number, () => void>();
  let workspaceProps: EnvironmentKeysWorkspaceProps = { orgSlug, projectSlug, environmentSlug, ...options };
  const Content = () => null; const Table = () => null; const Editor = () => null; const Import = () => null; const ExportConfirmation = () => null;
  const module = { exports: {} as any };
  const sameDependencies = (left: unknown[], right: unknown[]) =>
    left.length === right.length && left.every((value, position) => Object.is(value, right[position]));
  const reload = () => { retries++; };
  runInNewContext(compiled, {
    React, module, exports: module.exports, Error, DOMException,
    URL: {
      createObjectURL: (blob: Blob) => { const url = `blob:export-${objectUrls.length + 1}`; objectUrls.push({ url, blob }); return url; },
      revokeObjectURL: (url: string) => revokedUrls.push(url),
    },
    document: { createElement: (tag: string) => {
      assert.equal(tag, "a");
      const anchor = { href: "", download: "", rel: "", click() {
        if (clickError) throw clickError;
        downloads.push({ href: anchor.href, download: anchor.download, rel: anchor.rel });
      } };
      return anchor;
    } },
    window: {
      setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; },
      clearTimeout: (id: number) => timers.delete(id),
    },
    require: (specifier: string) => {
      if (specifier === "react") return {
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
      };
      if (specifier === "./use-secrets-resource") return {
        useSecretsResource: (nextLoader: typeof loader, deps: string[]) => {
          loader = nextLoader; dependencies.push(Array.from(deps));
          return { ...result, reload, setData: (data: EnvironmentKeysData | null) => { result.data = data; } };
        },
      };
      if (specifier === "@/lib/secrets-client") return { secretsClient: {
        project: async (org: string, vault: string, signal?: AbortSignal) => {
          metadataCalls.push({ type: "project", orgSlug: org, projectSlug: vault, signal }); return projectResult();
        },
        secrets: async (org: string, vault: string, env: string) => {
          metadataCalls.push({ type: "secrets", orgSlug: org, projectSlug: vault, environmentSlug: env }); return secretsResult();
        },
        revision: async (org: string, vault: string, env: string) => {
          metadataCalls.push({ type: "revision", orgSlug: org, projectSlug: vault, environmentSlug: env }); return revisionResult();
        },
        exportDotenv: async (org: string, vault: string, env: string, input: { confirmation: string; confirmProduction: boolean }) => {
          exports.push({ orgSlug: org, projectSlug: vault, environmentSlug: env, input: { ...input } }); return exportResult();
        },
      } };
      if (specifier === "./environment-keys-content") return { EnvironmentKeysContent: Content };
      if (specifier === "./secrets-table") return { SecretsTable: Table };
      if (specifier === "./secret-dialogs") return { SecretEditorDialog: Editor, ImportDotenvDialog: Import, ConfirmSecretActionDialog: ExportConfirmation };
      throw new Error(`Unexpected environment keys controller dependency: ${specifier}`);
    },
  });
  function collect(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(collect);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>;
    return [element, ...collect(element.props.children)];
  }
  return {
    metadataCalls, dependencies, exports, objectUrls, revokedUrls, downloads, timers,
    get retries() { return retries; }, get lateStateWrites() { return lateStateWrites; },
    setResult(next: Partial<typeof result>) { result = { ...result, ...next }; },
    setProjectResult(next: typeof projectResult) { projectResult = next; },
    setSecretsResult(next: typeof secretsResult) { secretsResult = next; },
    setRevisionResult(next: typeof revisionResult) { revisionResult = next; },
    setExportResult(next: typeof exportResult) { exportResult = next; },
    failClick(error = new Error("Download failed")) { clickError = error; },
    load(signal = new AbortController().signal) { assert.ok(loader, "render captures the real metadata loader"); return loader(signal); },
    shell(org = orgSlug, vault = projectSlug, env = environmentSlug) {
      return module.exports.VaultEnvironmentPageView({ ...workspaceProps, orgSlug: org, projectSlug: vault, environmentSlug: env }) as React.ReactElement<any>;
    },
    tick() { for (const [id, timer] of [...timers]) { timers.delete(id); timer(); } },
    render(nextOptions: SharedWorkspaceOptions = {}) {
      assert.equal(disposed, false, "do not render an unmounted workspace");
      workspaceProps = { ...workspaceProps, ...nextOptions };
      let tree: React.ReactNode; let passes = 0;
      do {
        assert.ok(passes++ < 20, "workspace state must settle without a render loop");
        index = 0; dirty = false; effects = [];
        tree = module.exports.EnvironmentKeysWorkspace(workspaceProps);
        if (!dirty) effects.forEach((effect, position) => {
          const previous = committed[position];
          if (previous && sameDependencies(previous.deps, effect.deps)) return;
          previous?.cleanup?.();
          committed[position] = { deps: effect.deps.slice(), cleanup: effect.callback() ?? undefined };
        });
      } while (dirty);
      const elements = collect(tree);
      const content = elements.find((element) => element.type === Content);
      assert.ok(content);
      return { content: content.props as EnvironmentKeysContentProps,
        table: elements.find((element) => element.type === Table),
        editor: elements.find((element) => element.type === Editor),
        importing: elements.find((element) => element.type === Import),
        exportConfirmation: elements.find((element) => element.type === ExportConfirmation) };
    },
    dispose() { committed.forEach((effect) => effect.cleanup?.()); disposed = true; },
  };
}

async function settle() { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); }

test("environment keys load only scoped metadata, forward cancellation, and preserve a legitimate zero revision", async () => {
  const controller = await loadController("team /?β", "api /?β", "staging");
  const view = controller.render();
  assert.equal(view.content.loading, true);
  assert.equal(view.table, undefined);
  assert.equal(controller.exports.length, 0, "loading metadata must never request plaintext export");
  assert.deepEqual(controller.dependencies.at(-1), ["team /?β", "api /?β", "staging"]);
  controller.setRevisionResult(async () => ({ revision: 0 }));
  const signal = new AbortController().signal;
  const loaded = await controller.load(signal);
  assert.equal(loaded.project, project);
  assert.equal(loaded.environment, staging);
  assert.deepEqual(loaded.secrets, [secret]);
  assert.equal(loaded.revision, 0);
  assert.deepEqual(controller.metadataCalls, [
    { type: "project", orgSlug: "team /?β", projectSlug: "api /?β", signal },
    { type: "secrets", orgSlug: "team /?β", projectSlug: "api /?β", environmentSlug: "staging" },
    { type: "revision", orgSlug: "team /?β", projectSlug: "api /?β", environmentSlug: "staging" },
  ]);
  assert.equal(controller.exports.length, 0);
  controller.dispose();
});

test("metadata loader rejects absent environments before loading keys and honors cancellation at both async stages", async () => {
  const missing = await loadController("acme", "api", "deleted"); missing.render();
  await assert.rejects(missing.load(), /does not exist or has been deleted/);
  assert.deepEqual(missing.metadataCalls.map((call) => call.type), ["project"]);
  missing.dispose();
  for (const stage of ["project", "metadata"] as const) {
    const controller = await loadController(); controller.render();
    const cancellation = new AbortController();
    if (stage === "project") controller.setProjectResult(async () => { cancellation.abort(); return project; });
    else controller.setSecretsResult(async () => { cancellation.abort(); return [secret]; });
    await assert.rejects(controller.load(cancellation.signal), { name: "AbortError" });
    assert.deepEqual(controller.metadataCalls.map((call) => call.type), stage === "project" ? ["project"] : ["project", "secrets", "revision"]);
    assert.equal(controller.exports.length, 0);
    controller.dispose();
  }
});

test("shared vault metadata skips its project request but still loads only scoped secret metadata and revision", async () => {
  const sharedProject = { ...project, name: "Shared API vault" };
  const controller = await loadController("team /?β", "api /?β", "staging", { project: sharedProject, sharedLayout: true });
  controller.setProjectResult(async () => { throw new Error("Shared vault must not be fetched again"); });
  controller.setRevisionResult(async () => ({ revision: 0 }));
  controller.render();
  const loaded = await controller.load();
  assert.equal(loaded.project, sharedProject);
  assert.equal(loaded.environment, staging);
  assert.deepEqual(loaded.secrets, [secret]);
  assert.equal(loaded.revision, 0);
  assert.deepEqual(controller.metadataCalls, [
    { type: "secrets", orgSlug: "team /?β", projectSlug: "api /?β", environmentSlug: "staging" },
    { type: "revision", orgSlug: "team /?β", projectSlug: "api /?β", environmentSlug: "staging" },
  ]);
  assert.deepEqual(controller.dependencies.at(-1), ["team /?β", "api /?β", "staging"]);
  assert.equal(controller.exports.length, 0, "shared metadata never fetches plaintext");
  const refreshedEnvironment = { ...staging, name: "Updated shared staging", revision: 18 };
  const refreshedProject = { ...sharedProject, environments: [refreshedEnvironment, production] };
  controller.render({ project: refreshedProject });
  const refreshed = await controller.load();
  assert.equal(refreshed.project, refreshedProject, "the latest shared vault is used by a subsequent metadata reload");
  assert.equal(refreshed.environment, refreshedEnvironment);
  assert.deepEqual(controller.dependencies.at(-1), ["team /?β", "api /?β", "staging"]);
  assert.equal(controller.metadataCalls.some((call) => call.type === "project"), false);
  controller.dispose();
});

test("shared vault loader retains missing-environment and before/after-request cancellation checks", async () => {
  const missing = await loadController("acme", "api", "deleted", { project });
  missing.render();
  await assert.rejects(missing.load(), /does not exist or has been deleted/);
  assert.deepEqual(missing.metadataCalls, [], "a missing shared environment cannot request keys or revision");
  missing.dispose();
  for (const stage of ["before", "metadata"] as const) {
    const controller = await loadController("acme", "api", "staging", { project });
    const cancellation = new AbortController();
    controller.render();
    if (stage === "before") cancellation.abort();
    else controller.setSecretsResult(async () => { cancellation.abort(); return [secret]; });
    await assert.rejects(controller.load(cancellation.signal), { name: "AbortError" });
    assert.deepEqual(controller.metadataCalls.map((call) => call.type), stage === "before" ? [] : ["secrets", "revision"]);
    assert.equal(controller.exports.length, 0);
    controller.dispose();
  }
});

test("shared layout forwards its action host and row scrolling without changing org/vault/environment identity", async () => {
  const actionsContainer = {} as HTMLElement;
  const onProjectMutated = () => {};
  const controller = await loadController("team /?β", "api /?β", "staging", { project, sharedLayout: true, actionsContainer, onProjectMutated });
  controller.setResult({ data: snapshot, loading: false, refreshing: false });
  let view = controller.render();
  const shell = controller.shell();
  assert.equal(shell.key, JSON.stringify(["team /?β", "api /?β", "staging"]));
  assert.equal(shell.props.project, project);
  assert.equal(shell.props.sharedLayout, true);
  assert.equal(shell.props.actionsContainer, actionsContainer);
  assert.equal(shell.props.onProjectMutated, onProjectMutated);
  assert.equal(view.content.sharedLayout, true);
  assert.equal(view.content.actionsContainer, actionsContainer);
  assert.equal(view.table?.props.contained, true);
  assert.equal(view.table?.props.scrollRows, true);
  const tableKey = view.table?.key;
  assert.equal(tableKey, JSON.stringify(["team /?β", "api /?β", "env-staging"]));
  controller.setResult({ data: { ...snapshot, environment: { ...staging, name: "Renamed staging" }, revision: 18 } });
  view = controller.render({ project: { ...project, name: "Renamed vault" }, actionsContainer: null, sharedLayout: false });
  assert.equal(controller.shell().key, shell.key, "shared layout or metadata refresh must not remount the scope");
  assert.equal(view.table?.key, tableKey);
  assert.equal(view.table?.props.scrollRows, false, "row scrolling remains an explicit shared-layout opt-in");
  assert.equal(view.content.sharedLayout, false);
  assert.equal(view.content.actionsContainer, null);
  for (const next of [["other-team", "api /?β", "staging"], ["team /?β", "other-vault", "staging"], ["team /?β", "api /?β", "production"]]) {
    assert.notEqual(controller.shell(...next as [string, string, string]).key, shell.key);
  }
  assert.equal(controller.metadataCalls.length, 0);
  controller.dispose();
});

test("org/vault/environment path changes remount all state and table identity; same-scope metadata refresh keeps the table", async () => {
  const controller = await loadController();
  controller.setResult({ data: snapshot, loading: false, refreshing: false });
  let view = controller.render(); const originalTableKey = view.table?.key;
  assert.equal(originalTableKey, JSON.stringify(["acme", "api", "env-staging"]));
  assert.equal(view.table?.props.contained, true);
  assert.equal(view.table?.props.scrollRows, undefined, "standalone consumers do not opt into row scrolling");
  const shell = controller.shell();
  for (const next of [["other-team", "api", "staging"], ["acme", "other-vault", "staging"], ["acme", "api", "production"]]) {
    const nextShell = controller.shell(...next as [string, string, string]);
    assert.notEqual(nextShell.key, shell.key, "actual route scope changes remount drafts and revealed table state");
    assert.equal(nextShell.type, shell.type);
    assert.equal(nextShell.key, JSON.stringify(next));
  }
  assert.notEqual(controller.shell("a:b", "c", "d").key, controller.shell("a", "b:c", "d").key, "scope keys cannot collide on delimiter characters");
  controller.setResult({ data: { ...snapshot, environment: { ...staging }, secrets: [{ ...secret, version: 5 }], revision: 18 }, refreshing: true });
  view = controller.render();
  assert.equal(view.table?.key, originalTableKey);
  assert.equal(view.table?.props.revision, 18);
  controller.dispose();
  const destination = await loadController("other-team", "other-vault", "production");
  const next = destination.render();
  assert.equal(next.table, undefined);
  assert.equal(next.editor, undefined);
  assert.equal(next.importing, undefined);
  assert.equal(next.exportConfirmation, undefined);
  assert.equal(next.content.data, null);
  destination.dispose();
});

test("add/import capture original environment, list, and expected revision while metadata refreshes or fails", async () => {
  const controller = await loadController();
  controller.setResult({ data: snapshot, loading: false, refreshing: false });
  controller.render().content.onAdd(); controller.render().content.onImport();
  let view = controller.render();
  assert.equal(view.editor?.props.environment, staging);
  assert.equal(view.editor?.props.environments, project.environments);
  assert.equal(view.editor?.props.revision, 17);
  assert.equal(view.importing?.props.environment, staging);
  assert.equal(view.importing?.props.revision, 17);
  const refreshed = { ...snapshot, environment: { ...staging, name: "Server renamed", revision: 18 }, project: { ...project, environments: [{ ...staging, revision: 18 }] }, revision: 18 };
  controller.setResult({ data: refreshed, refreshing: true }); view = controller.render();
  assert.equal(view.content.data, refreshed);
  assert.equal(view.editor?.props.environment, staging);
  assert.equal(view.editor?.props.environments, project.environments);
  assert.equal(view.editor?.props.revision, 17);
  assert.equal(view.importing?.props.environment, staging);
  assert.equal(view.importing?.props.revision, 17);
  controller.setResult({ refreshing: false, error: "Could not refresh" }); view = controller.render();
  assert.equal(view.content.error, "Could not refresh");
  assert.equal(view.editor?.props.environment, staging);
  assert.equal(view.importing?.props.environment, staging);
  view.editor?.props.onClose(); view.importing?.props.onClose(); view = controller.render();
  assert.equal(view.editor, undefined);
  assert.equal(view.importing, undefined);
  assert.equal(controller.retries, 0, "closing drafts must not reload or submit data");
  controller.dispose();
});

test("table add/mutation, editor save, import completion, and retry keep existing reload flows without invented metadata", async () => {
  const controller = await loadController();
  controller.setResult({ data: snapshot, loading: false, refreshing: false });
  let view = controller.render();
  view.table?.props.onAdd(); view = controller.render();
  assert.equal(view.editor?.props.environment, staging);
  view.editor?.props.onSaved(); view.editor?.props.onClose(); view = controller.render();
  assert.equal(controller.retries, 1);
  assert.equal(view.content.data, snapshot);
  view.content.onImport(); view = controller.render(); view.importing?.props.onImported(); view.importing?.props.onClose();
  view = controller.render(); view.table?.props.onMutated(); view.content.onRetry();
  assert.equal(controller.retries, 4);
  assert.equal(view.content.data, snapshot);
  assert.equal(controller.exports.length, 0);
  controller.dispose();
});

test("one mounted mutation callback refreshes key metadata and the shared vault, but retry, dismissal, export, and late completions do not", async () => {
  const sharedReloads: number[] = [];
  const controller = await loadController("acme", "api", "staging", {
    project, sharedLayout: true, onProjectMutated: () => { sharedReloads.push(controller.retries); },
  });
  controller.setResult({ data: snapshot, loading: false, refreshing: false });
  controller.render().content.onAdd(); controller.render().content.onImport();
  let view = controller.render();
  assert.ok(view.table); assert.ok(view.editor); assert.ok(view.importing);
  const completions = [view.table.props.onMutated, view.editor.props.onSaved, view.importing.props.onImported];
  assert.equal(completions[0], completions[1], "table and editor receive the same mutation refresh callback");
  assert.equal(completions[0], completions[2], "import completion receives that same callback");
  assert.equal(controller.retries, 0);
  assert.deepEqual(sharedReloads, [], "opening a draft is not a mutation");
  for (const complete of completions) complete();
  assert.equal(controller.retries, 3);
  assert.deepEqual(sharedReloads, [1, 2, 3], "each mutation refreshes local metadata before notifying the shared vault");
  assert.equal(view.content.data, snapshot, "callbacks request real metadata rather than inventing local counts or revision");
  view.editor.props.onClose(); view.importing.props.onClose();
  view = controller.render();
  assert.equal(view.editor, undefined); assert.equal(view.importing, undefined);
  assert.equal(controller.retries, 3);
  assert.equal(sharedReloads.length, 3);
  view.content.onRetry();
  assert.equal(controller.retries, 4);
  assert.equal(sharedReloads.length, 3, "retry refreshes keys only, not a claimed vault mutation");
  view.content.onExport(); await settle(); view = controller.render();
  assert.equal(controller.downloads.length, 1);
  assert.equal(view.content.exporting, false);
  assert.equal(controller.retries, 4);
  assert.equal(sharedReloads.length, 3, "read-only export must not refresh shared vault metadata as a mutation");
  controller.tick(); controller.dispose();
  for (const complete of completions) complete();
  assert.equal(controller.retries, 4, "old-scope completion cannot reload unmounted key metadata");
  assert.equal(sharedReloads.length, 3, "old-scope completion cannot refresh the shared vault either");
  assert.equal(controller.lateStateWrites, 0);
});

test("nonproduction export downloads only after the explicit action, blocks duplicates, and revokes its object URL", async () => {
  const controller = await loadController("org/team");
  controller.setResult({ data: snapshot, loading: false, refreshing: false });
  let finish!: (blob: Blob) => void;
  controller.setExportResult(() => new Promise<Blob>((resolve) => { finish = resolve; }));
  let view = controller.render();
  assert.equal(controller.exports.length, 0);
  view.content.onExport(); view.content.onExport(); view = controller.render();
  assert.equal(view.content.exporting, true);
  assert.equal(view.exportConfirmation, undefined);
  assert.equal(controller.exports.length, 1);
  assert.deepEqual(controller.exports[0], { orgSlug: "org/team", projectSlug: "api", environmentSlug: "staging",
    input: { confirmation: "Staging", confirmProduction: false } });
  assert.equal(controller.downloads.length, 0);
  const blob = new Blob(["API_KEY=test-only-export"]);
  finish(blob); await settle(); view = controller.render();
  assert.equal(view.content.exporting, false);
  assert.equal(controller.objectUrls[0].blob, blob);
  assert.deepEqual(controller.downloads, [{ href: "blob:export-1", download: "api.staging.env", rel: "noopener" }]);
  assert.equal(controller.revokedUrls.length, 0);
  controller.tick();
  assert.deepEqual(controller.revokedUrls, ["blob:export-1"]);
  controller.dispose();
});

test("production export requires exact captured name plus production acknowledgment and preserves confirmation during refresh", async () => {
  const controller = await loadController("acme", "api", "production");
  controller.setResult({ data: productionSnapshot, loading: false, refreshing: false });
  controller.render().content.onExport(); let view = controller.render();
  assert.equal(controller.exports.length, 0);
  assert.equal(view.exportConfirmation?.props.confirmationText, "Production");
  assert.equal(view.exportConfirmation?.props.production, true);
  controller.setResult({ data: { ...productionSnapshot, environment: { ...production, name: "Server renamed production", isProduction: false } }, refreshing: true });
  view = controller.render();
  assert.equal(view.exportConfirmation?.props.confirmationText, "Production");
  view.exportConfirmation?.props.onConfirm(false, "Production");
  view.exportConfirmation?.props.onConfirm(true, "production");
  view.exportConfirmation?.props.onConfirm(true, " Production ");
  await settle();
  assert.equal(controller.exports.length, 0);
  let finish!: (blob: Blob) => void;
  controller.setExportResult(() => new Promise<Blob>((resolve) => { finish = resolve; }));
  view.exportConfirmation?.props.onConfirm(true, "Production");
  view.exportConfirmation?.props.onConfirm(true, "Production"); view = controller.render();
  assert.equal(controller.exports.length, 1);
  assert.deepEqual(controller.exports[0], { orgSlug: "acme", projectSlug: "api", environmentSlug: "production",
    input: { confirmation: "Production", confirmProduction: true } });
  assert.equal(view.exportConfirmation?.props.loading, true);
  view.exportConfirmation?.props.onClose();
  assert.ok(controller.render().exportConfirmation, "an in-flight export cannot close its confirmation");
  finish(new Blob(["API_KEY=test-only-export"])); await settle(); view = controller.render();
  assert.equal(view.exportConfirmation, undefined);
  assert.equal(view.content.exporting, false);
  assert.equal(controller.downloads[0].download, "api.production.env");
  controller.tick(); controller.dispose();
});

test("export failure keeps production confirmation open with the error and allows a safe retry", async () => {
  const controller = await loadController("acme", "api", "production");
  controller.setResult({ data: productionSnapshot, loading: false, refreshing: false });
  controller.render().content.onExport();
  controller.setExportResult(async () => { throw new Error("Export unavailable"); });
  controller.render().exportConfirmation?.props.onConfirm(true, "Production"); await settle();
  let view = controller.render();
  assert.equal(view.content.actionError, "Export unavailable");
  assert.equal(view.content.exporting, false);
  assert.equal(view.exportConfirmation?.props.open, true);
  assert.equal(view.exportConfirmation?.props.description, "Export unavailable");
  assert.equal(controller.objectUrls.length, 0);
  assert.equal(controller.downloads.length, 0);
  controller.setExportResult(async () => new Blob(["API_KEY=test-only-export"]));
  view.exportConfirmation?.props.onConfirm(true, "Production"); await settle(); view = controller.render();
  assert.equal(view.content.actionError, null);
  assert.equal(view.exportConfirmation, undefined);
  assert.equal(controller.exports.length, 2);
  assert.equal(controller.downloads.length, 1);
  controller.tick(); controller.dispose();
});

test("failed native download still revokes the plaintext object URL and reports the failure", async () => {
  const controller = await loadController();
  controller.setResult({ data: snapshot, loading: false, refreshing: false });
  controller.failClick(); controller.render().content.onExport(); await settle();
  const view = controller.render();
  assert.equal(view.content.actionError, "Download failed");
  assert.equal(view.content.exporting, false);
  assert.equal(controller.downloads.length, 0);
  assert.equal(controller.objectUrls.length, 1);
  controller.tick();
  assert.deepEqual(controller.revokedUrls, ["blob:export-1"]);
  controller.dispose();
});

test("old-scope export success or error after unmount cannot download plaintext or update the destination workspace", async () => {
  for (const outcome of ["success", "error"] as const) {
    const controller = await loadController("old-team", "old-vault", "production");
    controller.setResult({ data: productionSnapshot, loading: false, refreshing: false });
    let finish!: (blob: Blob) => void; let fail!: (error: Error) => void;
    controller.setExportResult(() => new Promise<Blob>((resolve, reject) => { finish = resolve; fail = reject; }));
    controller.render().content.onExport(); controller.render().exportConfirmation?.props.onConfirm(true, "Production");
    assert.equal(controller.exports.length, 1);
    controller.dispose();
    if (outcome === "success") finish(new Blob(["API_KEY=test-only-export"])); else fail(new Error("Late export failure"));
    await settle();
    assert.equal(controller.objectUrls.length, 0);
    assert.equal(controller.downloads.length, 0);
    assert.equal(controller.timers.size, 0);
    assert.equal(controller.lateStateWrites, 0);
    assert.equal(controller.retries, 0);
    const destination = await loadController("new-team", "new-vault", "staging");
    const next = destination.render();
    assert.equal(next.content.actionError, null);
    assert.equal(next.content.exporting, false);
    assert.equal(next.exportConfirmation, undefined);
    assert.equal(next.content.data, null);
    assert.equal(destination.downloads.length, 0);
    destination.dispose();
  }
});

test("late table/editor/import completion callbacks do not reload an unmounted scope", async () => {
  const controller = await loadController();
  controller.setResult({ data: snapshot, loading: false, refreshing: false });
  controller.render().content.onAdd(); controller.render().content.onImport();
  const view = controller.render();
  controller.dispose();
  view.table?.props.onMutated(); view.editor?.props.onSaved(); view.importing?.props.onImported();
  assert.equal(controller.retries, 0);
  assert.equal(controller.lateStateWrites, 0);
  assert.equal(controller.exports.length, 0);
});
