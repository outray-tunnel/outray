import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import type { SecretTrashItem } from "../src/lib/secrets-client";
import type { SecretsTrashContentProps } from "../src/components/secrets/trash-content";

const item: SecretTrashItem = {
  id: "deleted-secret", batchId: "batch-a", type: "secret", name: "API_KEY", itemCount: 1,
  isProduction: false, deletedAt: "2026-10-01T10:00:00Z", expiresAt: null,
  metadata: { projectSlug: "api", environmentSlug: "development" },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}

type QueryState = { data: SecretTrashItem[] | undefined; isPending: boolean; isFetching: boolean; error: Error | null };
type Effect = { callback: () => void | (() => void); deps: unknown[] };

/** Execute the actual route handlers, replacing only network/query infrastructure and rendered children. */
async function loadController(orgSlug = "acme") {
  const source = await readFile(new URL("../src/routes/$orgSlug/secrets/trash.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  let permission: { data: boolean | undefined; isPending: boolean } = { data: true, isPending: false };
  let query: QueryState = { data: [item], isPending: false, isFetching: false, error: null };
  let index = 0; let disposed = false; let writesAfterUnmount = 0; let refetches = 0; let shellOrg = orgSlug;
  const values: any[] = [];
  let effects: Effect[] = [];
  const committed: Array<{ deps: unknown[]; cleanup?: () => void }> = [];
  const queryOptions: Array<{ queryKey: string[]; queryFn: () => Promise<SecretTrashItem[]>; staleTime: number }> = [];
  const permissions: unknown[] = [];
  const reads: string[] = [];
  const mutations: Array<{ orgSlug: string; item: SecretTrashItem; confirmed: boolean }> = [];
  const events: string[] = [];
  const cancellations: string[][] = [];
  const cacheWrites: Array<{ key: string[]; data: SecretTrashItem[] | undefined }> = [];
  const navigations: unknown[] = [];
  let restoreResult: () => Promise<void> = async () => {};
  let cancelResult: () => Promise<void> = async () => {};
  let readResult: () => Promise<SecretTrashItem[]> = async () => [item];
  let routeComponent!: () => React.ReactElement<any>;
  const Content = () => null; const Dialog = () => null;
  const same = (left: unknown[], right: unknown[]) => left.length === right.length && left.every((value, position) => Object.is(value, right[position]));
  const hooks = {
    useState: (initial: any) => {
      const slot = index++;
      if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
      return [values[slot], (next: any) => {
        if (disposed) writesAfterUnmount++;
        values[slot] = typeof next === "function" ? next(values[slot]) : next;
      }];
    },
    useRef: (initial: any) => { const slot = index++; return values[slot] ?? (values[slot] = { current: initial }); },
    useEffect: (callback: Effect["callback"], deps: unknown[]) => effects.push({ callback, deps }),
  };
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, module, exports: module.exports, Error,
    require: (specifier: string) => {
      if (specifier === "react") return hooks;
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (options: { component: typeof routeComponent }) => {
        routeComponent = options.component;
        return { useParams: () => ({ orgSlug: shellOrg }), useNavigate: () => (next: unknown) => { navigations.push(next); } };
      } };
      if (specifier === "@tanstack/react-query") return {
        useQuery: (options: typeof queryOptions[number]) => { queryOptions.push(options); return { ...query, refetch: async () => { refetches++; events.push("refetch"); } }; },
        useQueryClient: () => ({
          cancelQueries: async ({ queryKey }: { queryKey: string[] }) => {
            cancellations.push(Array.from(queryKey)); events.push("cancel:start");
            await cancelResult(); events.push("cancel:end");
          },
          setQueryData: (key: string[], updater: (items: QueryState["data"]) => QueryState["data"]) => {
            query = { ...query, data: updater(query.data) };
            cacheWrites.push({ key: Array.from(key), data: query.data }); events.push("cache");
          },
        }),
      };
      if (specifier === "@/lib/auth-client") return { usePermission: (request: unknown) => { permissions.push(request); return permission; } };
      if (specifier === "@/lib/secrets-client") return { secretsClient: {
        trash: async (org: string) => { reads.push(org); return readResult(); },
        restoreTrash: async (org: string, selected: SecretTrashItem, confirmed: boolean) => {
          mutations.push({ orgSlug: org, item: selected, confirmed }); events.push("restore"); return restoreResult();
        },
      } };
      if (specifier === "@/components/secrets/trash-content") return { SecretsTrashContent: Content };
      if (specifier === "@/components/secrets/trash-restore-dialog") return { TrashRestoreDialog: Dialog };
      throw new Error(`Unexpected Trash controller dependency: ${specifier}`);
    },
  });
  function collect(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(collect);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>;
    return [element, ...collect(element.props.children)];
  }
  return {
    queryOptions, permissions, reads, mutations, events, cancellations, cacheWrites, navigations,
    get refetches() { return refetches; }, get writesAfterUnmount() { return writesAfterUnmount; },
    setPermission(data: boolean | undefined, isPending = false) { permission = { data, isPending }; },
    setQuery(next: Partial<QueryState>) { query = { ...query, ...next }; },
    setRestoreResult(next: typeof restoreResult) { restoreResult = next; },
    setCancelResult(next: typeof cancelResult) { cancelResult = next; },
    setReadResult(next: typeof readResult) { readResult = next; },
    shell(nextOrg = orgSlug) { shellOrg = nextOrg; return routeComponent(); },
    render() {
      assert.equal(disposed, false); index = 0; effects = [];
      const tree = module.exports.WorkspaceTrashPage({ orgSlug });
      effects.forEach((effect, position) => {
        const previous = committed[position];
        if (previous && same(previous.deps, effect.deps)) return;
        previous?.cleanup?.();
        committed[position] = { deps: Array.from(effect.deps), cleanup: effect.callback() ?? undefined };
      });
      const elements = collect(tree);
      const content = elements.find((element) => element.type === Content);
      const dialog = elements.find((element) => element.type === Dialog);
      assert.ok(content); assert.ok(dialog);
      return { content: content.props as SecretsTrashContentProps, dialog };
    },
    dispose() { committed.forEach((effect) => effect.cleanup?.()); disposed = true; },
  };
}

async function settle() { for (let turn = 0; turn < 16; turn++) await Promise.resolve(); }

test("Trash reads the complete organization-scoped query regardless of restore permission", async () => {
  const controller = await loadController("team /?β"); controller.setPermission(false);
  const records = Array.from({ length: 33 }, (_, index) => ({ ...item, batchId: `batch-${index}` }));
  controller.setReadResult(async () => records);
  const view = controller.render(); const query = controller.queryOptions.at(-1)!;
  assert.deepEqual(Array.from(query.queryKey), ["secrets", "team /?β", "trash"]);
  assert.equal(query.staleTime, 15_000);
  assert.equal(await query.queryFn(), records);
  assert.deepEqual(controller.reads, ["team /?β"]);
  assert.equal(view.content.canRestore, false); assert.equal(view.content.permissionPending, false);
  assert.equal(view.content.items?.[0], item, "members still receive the listing");
  assert.deepEqual(JSON.parse(JSON.stringify(controller.permissions[0])), { secretTrash: ["restore"] });
  view.content.onRestore(item); controller.render().dialog.props.onConfirm(true); await settle();
  assert.equal(controller.render().dialog.props.item, null); assert.equal(controller.mutations.length, 0);
  controller.dispose();
});

test("pending permission blocks both opening Restore and submitting an already-open confirmation", async () => {
  const controller = await loadController(); controller.setPermission(undefined, true);
  let view = controller.render(); view.content.onRestore(item);
  assert.equal(controller.render().dialog.props.item, null);
  controller.setPermission(true); controller.render().content.onRestore(item);
  assert.equal(controller.render().dialog.props.item, item);
  for (const permission of [{ data: undefined, pending: true }, { data: false, pending: false }]) {
    controller.setPermission(permission.data, permission.pending);
    view = controller.render(); view.dialog.props.onConfirm(true); await settle();
    assert.equal(controller.mutations.length, 0); assert.equal(controller.render().dialog.props.item, item);
  }
  controller.dispose();
});

test("search, type filters, clear, retry and empty-state navigation are scoped independent actions", async () => {
  const controller = await loadController("custom team"); let view = controller.render();
  view.content.onSearchChange("  original location  "); view.content.onViewChange("vaults"); view = controller.render();
  assert.equal(view.content.search, "  original location  "); assert.equal(view.content.view, "vaults");
  assert.equal(controller.reads.length, 0, "local filters do not reveal values or make requests");
  view.content.onRetry(); assert.equal(controller.refetches, 1);
  view.content.onChooseVaults();
  assert.deepEqual(JSON.parse(JSON.stringify(controller.navigations)), [{ to: "/$orgSlug/secrets/vaults", params: { orgSlug: "custom team" } }]);
  view.content.onClearFilters(); view = controller.render(); assert.equal(view.content.search, ""); assert.equal(view.content.view, "all");
  controller.dispose();
});

test("the pending guard blocks double submits, dismissal and changing the selected item synchronously", async () => {
  const controller = await loadController(); const request = deferred<void>();
  controller.setRestoreResult(() => request.promise);
  controller.render().content.onRestore(item); let view = controller.render();
  view.dialog.props.onConfirm(true); view.dialog.props.onConfirm(true); view.dialog.props.onClose();
  view.content.onRestore({ ...item, batchId: "different-batch", name: "OTHER_KEY" });
  view = controller.render(); assert.equal(view.dialog.props.item, item); assert.equal(view.dialog.props.loading, true);
  assert.equal(controller.mutations.length, 1); assert.equal(controller.mutations[0].confirmed, true);
  request.reject(new Error("Cannot restore yet")); await settle();
  assert.equal(controller.render().dialog.props.loading, false); controller.dispose();
});

test("a failed restore preserves the exact item and filters and exposes an inline retryable error", async () => {
  const controller = await loadController(); controller.setRestoreResult(async () => { throw new Error("A secret now uses this key"); });
  let view = controller.render(); view.content.onSearchChange("API"); view.content.onViewChange("secrets"); view.content.onRestore(item);
  view = controller.render(); const dialogKey = view.dialog.key;
  view.dialog.props.onConfirm(false); await settle(); view = controller.render();
  assert.equal(view.dialog.key, dialogKey); assert.equal(view.dialog.props.item, item);
  assert.equal(view.dialog.props.error, "A secret now uses this key"); assert.equal(view.dialog.props.loading, false);
  assert.equal(view.content.search, "API"); assert.equal(view.content.view, "secrets"); assert.equal(view.content.items?.[0], item);
  assert.equal(controller.cacheWrites.length, 0); assert.equal(controller.refetches, 0);
  controller.setRestoreResult(async () => {}); view.dialog.props.onConfirm(true); await settle();
  view = controller.render(); assert.equal(controller.mutations.length, 2); assert.equal(view.dialog.props.item, null);
  assert.equal(view.dialog.props.error, null); assert.match(view.content.notice!, /Restored/);
  controller.dispose();
});

test("successful restoration cancels stale loads first and removes only the selected batch before refetching", async () => {
  const controller = await loadController("acme"); const cancel = deferred<void>();
  const sameRoot = { ...item, batchId: "batch-b" }; const unrelated = { ...item, id: "other", batchId: "batch-c" };
  controller.setQuery({ data: [item, sameRoot, unrelated] }); controller.setCancelResult(() => cancel.promise);
  controller.render().content.onRestore(item); controller.render().dialog.props.onConfirm(true); await settle();
  assert.deepEqual(controller.events, ["restore", "cancel:start"]);
  assert.equal(controller.cacheWrites.length, 0); assert.equal(controller.refetches, 0);
  assert.equal(controller.render().dialog.props.loading, true);
  cancel.resolve(); await settle(); const view = controller.render();
  assert.deepEqual(controller.events, ["restore", "cancel:start", "cancel:end", "cache", "refetch"]);
  assert.deepEqual(controller.cancellations, [["secrets", "acme", "trash"]]);
  assert.deepEqual(controller.cacheWrites[0].key, ["secrets", "acme", "trash"]);
  assert.deepEqual(view.content.items, [sameRoot, unrelated], "a matching root ID in another batch is retained");
  assert.equal(view.dialog.props.item, null); assert.equal(view.dialog.props.loading, false);
  assert.match(view.content.notice!, /API_KEY/); view.content.onDismissNotice?.(); assert.equal(controller.render().content.notice, null);
  controller.dispose();
});

test("move restoration reports source recovery without claiming destination changes were undone", async () => {
  const controller = await loadController(); const moved = { ...item, type: "bulk" as const, metadata: { reason: "move" } };
  controller.setQuery({ data: [moved] }); controller.render().content.onRestore(moved);
  controller.render().dialog.props.onConfirm(false); await settle();
  assert.equal(controller.render().content.notice, "Source secrets restored. Destination values are unchanged.");
  controller.dispose();
});

test("org-keyed remount resets filters and confirmation while late old-org mutations cannot touch its UI or cache", async () => {
  for (const outcome of ["success", "failure"] as const) {
    const old = await loadController("old-team"); const request = deferred<void>(); old.setRestoreResult(() => request.promise);
    let view = old.render(); view.content.onSearchChange("old filter"); view.content.onViewChange("secrets"); view.content.onRestore(item);
    view = old.render(); assert.equal(old.shell().key, "old-team"); assert.equal(old.shell("new-team").key, "new-team");
    view.dialog.props.onConfirm(false); old.dispose();
    const destination = await loadController("new-team"); const next = destination.render();
    assert.equal(next.content.search, ""); assert.equal(next.content.view, "all"); assert.equal(next.dialog.props.item, null);
    assert.deepEqual(Array.from(destination.queryOptions.at(-1)!.queryKey), ["secrets", "new-team", "trash"]);
    if (outcome === "success") request.resolve(); else request.reject(new Error("Old-team failure"));
    await settle();
    assert.equal(old.writesAfterUnmount, 0); assert.equal(old.cacheWrites.length, 0); assert.equal(old.cancellations.length, 0); assert.equal(old.refetches, 0);
    assert.equal(destination.render().content.notice, null); assert.equal(destination.render().dialog.props.error, null);
    destination.dispose();
  }
});

test("unmount during cancellation suppresses subsequent cache writes, refetch and UI completion", async () => {
  const controller = await loadController(); const cancel = deferred<void>(); controller.setCancelResult(() => cancel.promise);
  controller.render().content.onRestore(item); controller.render().dialog.props.onConfirm(false); await settle();
  assert.equal(controller.cancellations.length, 1); controller.dispose(); cancel.resolve(); await settle();
  assert.equal(controller.cacheWrites.length, 0); assert.equal(controller.refetches, 0); assert.equal(controller.writesAfterUnmount, 0);
});

test("background refresh or failure preserves filters, listing and the current confirmation identity", async () => {
  const controller = await loadController(); let view = controller.render();
  view.content.onSearchChange("API"); view.content.onViewChange("secrets"); view.content.onRestore(item); view = controller.render(); const key = view.dialog.key;
  const updated = [{ ...item, name: "NEW_KEY" }];
  for (const state of [{ data: updated, isFetching: true, error: null }, { data: updated, isFetching: false, error: new Error("Refresh failed") }]) {
    controller.setQuery(state); view = controller.render();
    assert.equal(view.content.items, updated); assert.equal(view.content.refreshing, state.isFetching);
    assert.equal(view.content.error, state.error?.message); assert.equal(view.content.search, "API"); assert.equal(view.content.view, "secrets");
    assert.equal(view.dialog.key, key); assert.equal(view.dialog.props.item, item, "refresh does not silently retarget a confirmation");
  }
  view.dialog.props.onClose(); assert.equal(controller.render().dialog.props.item, null); controller.dispose();
});
