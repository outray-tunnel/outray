import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import { mergeAuditPages } from "../src/components/secrets/audit-data";
import type { SecretsAuditContentProps } from "../src/components/secrets/audit-content";
import type { SecretAuditEvent, SecretAuditPage } from "../src/lib/secrets-client";

const event: SecretAuditEvent = {
  id: "event-one", action: "secret.revealed", resourceType: "secret", resourceName: "API_KEY",
  projectId: "vault-api", projectName: "API", environmentName: "Production",
  actorType: "user", actorName: "Ada", createdAt: "2026-10-07T10:00:00Z",
};
const firstPage: SecretAuditPage = { events: [event], nextCursor: "opaque cursor /?β" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}

type QueryState = {
  data?: { pages: SecretAuditPage[] };
  isPending: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  hasNextPage: boolean;
  error: Error | null;
};
type QueryOptions = {
  queryKey: string[];
  initialPageParam: string | null;
  queryFn: (context: { pageParam: string | null }) => Promise<SecretAuditPage>;
  getNextPageParam: (page: SecretAuditPage) => string | undefined;
  staleTime: number;
  refetchOnWindowFocus: boolean;
};
type Cache = Map<string, QueryState>;
const cacheKey = (orgSlug: string) => JSON.stringify(["secrets", orgSlug, "audit"]);
const initialQuery = (): QueryState => ({ data: { pages: [firstPage] }, isPending: false, isFetching: false,
  isFetchingNextPage: false, isFetchNextPageError: false, hasNextPage: true, error: null });

/** Exercise route-owned state and callbacks. Query caching/network remain explicit test boundaries. */
async function controller(orgSlug = "acme", cache: Cache = new Map()) {
  const source = await readFile(new URL("../src/routes/$orgSlug/secrets/audit.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const values: any[] = [];
  let index = 0;
  let shellOrg = orgSlug;
  const queryOptions: QueryOptions[] = [];
  const reads: { orgSlug: string; cursor: string | null }[] = [];
  const fetches: { options: { cancelRefetch: boolean } }[] = [];
  const refreshes: { options: { cancelRefetch: boolean } }[] = [];
  const navigations: unknown[] = [];
  let readResult: () => Promise<SecretAuditPage> = async () => firstPage;
  let pageResult: () => Promise<unknown> = async () => {};
  let refreshResult: () => Promise<unknown> = async () => {};
  const key = cacheKey(orgSlug);
  if (!cache.has(key)) cache.set(key, initialQuery());
  const Content = () => null;
  const Sheet = () => null;
  let shell!: () => React.ReactElement<any>;
  class FakeHTMLElement { isConnected = true; focus() {} }
  const activeElement = new FakeHTMLElement();
  const document = { activeElement: activeElement as object | null };
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, module, exports: module.exports, Error, document, HTMLElement: FakeHTMLElement,
    require: (specifier: string) => {
      if (specifier === "react") return {
        useState(initial: any) {
          const slot = index++;
          if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
          return [values[slot], (next: any) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
        },
        useRef(initial: any) { const slot = index++; return values[slot] ?? (values[slot] = { current: initial }); },
        useMemo(read: () => unknown) { return read(); },
      };
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => (options: { component: typeof shell }) => {
        shell = options.component;
        return { useParams: () => ({ orgSlug: shellOrg }), useNavigate: () => (next: unknown) => { navigations.push(next); return Promise.resolve(); } };
      } };
      if (specifier === "@tanstack/react-query") return { useInfiniteQuery: (options: QueryOptions) => {
        queryOptions.push(options);
        const scopedKey = JSON.stringify(options.queryKey);
        assert.ok(cache.has(scopedKey), "the rendered controller reads only its own cache scope");
        return { ...cache.get(scopedKey),
          fetchNextPage: async (options: { cancelRefetch: boolean }) => { fetches.push({ options }); return pageResult(); },
          refetch: async (options: { cancelRefetch: boolean }) => { refreshes.push({ options }); return refreshResult(); },
        };
      } };
      if (specifier === "@/lib/secrets-client") return { secretsClient: { audit: async (org: string, cursor: string | null) => {
        reads.push({ orgSlug: org, cursor }); return readResult();
      } } };
      if (specifier === "@/components/secrets/audit-data") return { mergeAuditPages };
      if (specifier === "@/components/secrets/audit-content") return { SecretsAuditContent: Content };
      if (specifier === "@/components/secrets/audit-event-sheet") return { AuditEventSheet: Sheet };
      // No permission module is provided: a newly introduced owner/admin read gate fails this harness.
      throw new Error(`Unexpected Audit controller dependency: ${specifier}`);
    },
  });
  return {
    cache, queryOptions, reads, fetches, refreshes, navigations, activeElement,
    setQuery(next: Partial<QueryState>) { cache.set(key, { ...cache.get(key)!, ...next }); },
    setReadResult(next: typeof readResult) { readResult = next; },
    setPageResult(next: typeof pageResult) { pageResult = next; },
    setRefreshResult(next: typeof refreshResult) { refreshResult = next; },
    setActiveElement(next: object | null) { document.activeElement = next; },
    shell(nextOrg = orgSlug) { shellOrg = nextOrg; return shell(); },
    render() {
      index = 0;
      const tree = module.exports.WorkspaceAuditPage({ orgSlug }) as React.ReactElement<any>;
      const children = React.Children.toArray(tree.props.children) as React.ReactElement<any>[];
      const content = children.find((child) => child.type === Content);
      const sheet = children.find((child) => child.type === Sheet);
      assert.ok(content); assert.ok(sheet);
      return { content: content.props as SecretsAuditContentProps, sheet };
    },
  };
}

async function settle() { for (let turn = 0; turn < 16; turn++) await Promise.resolve(); }

test("all workspace members receive the org-scoped audit query without an owner/admin gate", async () => {
  const audit = await controller("team /?β");
  const view = audit.render();
  const options = audit.queryOptions.at(-1)!;
  assert.deepEqual(Array.from(options.queryKey), ["secrets", "team /?β", "audit"]);
  assert.equal(view.content.events?.[0], event);
  assert.equal(options.staleTime, 30_000);
  assert.equal(options.refetchOnWindowFocus, false, "focus must not refetch the entire loaded history");
  assert.equal(options.initialPageParam, null);
  assert.equal(await options.queryFn({ pageParam: options.initialPageParam }), firstPage);
  assert.equal(options.getNextPageParam(firstPage), firstPage.nextCursor);
  await options.queryFn({ pageParam: options.getNextPageParam(firstPage)! });
  assert.deepEqual(audit.reads, [{ orgSlug: "team /?β", cursor: null }, { orgSlug: "team /?β", cursor: "opaque cursor /?β" }]);
  assert.equal(options.getNextPageParam({ events: [], nextCursor: null }), undefined);
});

test("overlapping cursor pages deduplicate immutable event IDs and retain server order", async () => {
  const audit = await controller();
  const second = { ...event, id: "event-two", action: "secret.updated" };
  const duplicate = { ...event, resourceName: "A newer snapshot" };
  const pages: SecretAuditPage[] = [firstPage, { events: [duplicate, second], nextCursor: null }];
  audit.setQuery({ data: { pages }, hasNextPage: false });
  const view = audit.render();
  assert.deepEqual(view.content.events, [event, second]);
  assert.equal(view.content.events![0], event, "the first page owns the retained snapshot");
  assert.equal(pages[1].events.length, 2, "merging never mutates cached pages");
  assert.equal(view.content.hasMore, false);
});

test("local filters, clearing, and vault navigation do not fetch or alter cursor history", async () => {
  const audit = await controller("custom team");
  let view = audit.render();
  view.content.onSearchChange("  API value  "); view.content.onResourceChange("secret");
  view.content.onActorChange("machine"); view.content.onVaultChange("vault-api");
  view = audit.render();
  assert.equal(view.content.search, "  API value  ");
  assert.equal(view.content.resource, "secret"); assert.equal(view.content.actor, "machine"); assert.equal(view.content.vault, "vault-api");
  assert.equal(audit.reads.length + audit.fetches.length + audit.refreshes.length, 0);
  view.content.onChooseVaults();
  assert.deepEqual(JSON.parse(JSON.stringify(audit.navigations)), [{ to: "/$orgSlug/secrets/vaults", params: { orgSlug: "custom team" } }]);
  view.content.onClearFilters(); view = audit.render();
  assert.equal(view.content.search, "");
  for (const filter of ["resource", "actor", "vault"] as const) assert.equal(view.content[filter], "all");
});

test("event opening captures the exact focus origin and closing keeps the sheet mounted for restoration", async () => {
  const audit = await controller();
  let view = audit.render();
  view.content.onOpenEvent(event); view = audit.render();
  assert.equal(view.sheet.props.event, event);
  assert.equal(view.content.selectedId, event.id);
  assert.equal(view.sheet.props.returnFocusRef.current, audit.activeElement);
  const key = view.sheet.key;
  view.sheet.props.onClose(); view = audit.render();
  assert.equal(view.sheet.props.event, null); assert.equal(view.content.selectedId, undefined);
  assert.equal(view.sheet.key, key);
  assert.equal(view.sheet.props.returnFocusRef.current, audit.activeElement);
  audit.setActiveElement({ notAnElement: true }); view.content.onOpenEvent(event);
  assert.equal(audit.render().sheet.props.returnFocusRef.current, null);
});

test("background refetch and failure preserve filters, loaded pages, and the opened immutable event object", async () => {
  const audit = await controller();
  let view = audit.render();
  view.content.onSearchChange("API"); view.content.onResourceChange("secret");
  view.content.onActorChange("user"); view.content.onVaultChange("vault-api"); view.content.onOpenEvent(event);
  audit.setQuery({ isFetching: true }); view = audit.render();
  assert.equal(view.content.refreshing, true); assert.equal(view.content.loadingMore, false);
  assert.equal(view.content.events?.[0], event); assert.equal(view.sheet.props.event, event);
  const updated = { ...event, resourceName: "Changed name" };
  audit.setQuery({ isFetching: false, data: { pages: [{ events: [updated], nextCursor: null }] }, error: new Error("Refresh unavailable") });
  view = audit.render();
  assert.equal(view.content.events?.[0], updated);
  assert.equal(view.sheet.props.event, event, "open details must not silently switch to a replacement cache object");
  assert.equal(view.content.search, "API"); assert.equal(view.content.resource, "secret");
  assert.equal(view.content.actor, "user"); assert.equal(view.content.vault, "vault-api");
  assert.equal(view.content.error, "Refresh unavailable"); assert.equal(view.content.loadMoreError, null);
});

test("initial, refreshing, and older-page errors remain distinct without hiding loaded history", async () => {
  const audit = await controller();
  audit.setQuery({ data: undefined, isPending: true });
  let view = audit.render();
  assert.equal(view.content.events, undefined); assert.equal(view.content.loading, true); assert.equal(view.content.refreshing, false);
  audit.setQuery({ isPending: false, error: new Error("Initial load failed") }); view = audit.render();
  assert.equal(view.content.error, "Initial load failed"); assert.equal(view.content.loadMoreError, null);
  audit.setQuery({ data: { pages: [firstPage] }, isFetching: true, isFetchingNextPage: true, error: null }); view = audit.render();
  assert.equal(view.content.events?.[0], event); assert.equal(view.content.loadingMore, true); assert.equal(view.content.refreshing, false);
  audit.setQuery({ isFetching: false, isFetchingNextPage: false, isFetchNextPageError: true, error: new Error("Older page failed") }); view = audit.render();
  assert.equal(view.content.events?.[0], event); assert.equal(view.content.error, null); assert.equal(view.content.loadMoreError, "Older page failed");
});

test("load-more guards immediate duplicate clicks and contending refresh before a query-state render", async () => {
  const audit = await controller(); const pending = deferred<void>();
  audit.setPageResult(() => pending.promise);
  const view = audit.render();
  view.content.onLoadMore(); view.content.onLoadMore(); view.content.onRetry();
  assert.equal(audit.fetches.length, 1); assert.equal(audit.refreshes.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(audit.fetches[0].options)), { cancelRefetch: false });
  pending.resolve(); await settle();
  audit.render().content.onRetry(); await settle();
  assert.equal(audit.refreshes.length, 1, "pagination releases its guard after completion");
});

test("refresh guards immediate duplicates and contending pagination before a query-state render", async () => {
  const audit = await controller(); const pending = deferred<void>();
  audit.setRefreshResult(() => pending.promise);
  const view = audit.render();
  view.content.onRetry(); view.content.onRetry(); view.content.onLoadMore();
  assert.equal(audit.refreshes.length, 1); assert.equal(audit.fetches.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(audit.refreshes[0].options)), { cancelRefetch: false });
  pending.resolve(); await settle();
  audit.render().content.onLoadMore(); await settle(); assert.equal(audit.fetches.length, 1);
});

test("query fetch state and exhausted cursors prevent incompatible reads", async () => {
  const audit = await controller();
  audit.setQuery({ isFetching: true }); let view = audit.render();
  view.content.onRetry(); view.content.onLoadMore();
  assert.equal(audit.fetches.length + audit.refreshes.length, 0);
  audit.setQuery({ isFetching: false, hasNextPage: false }); view = audit.render();
  view.content.onLoadMore(); assert.equal(audit.fetches.length, 0);
  view.content.onRetry(); await settle(); assert.equal(audit.refreshes.length, 1);
});

test("rejected query actions are captured for inline errors, release their guards, and remain retryable", async () => {
  const audit = await controller();
  audit.setRefreshResult(async () => { audit.setQuery({ error: new Error("Refresh unavailable") }); throw new Error("Refresh unavailable"); });
  audit.render().content.onRetry(); await settle();
  assert.equal(audit.render().content.error, "Refresh unavailable");
  audit.setRefreshResult(async () => {}); audit.render().content.onRetry(); await settle();
  assert.equal(audit.refreshes.length, 2);
  audit.setPageResult(async () => { audit.setQuery({ isFetchNextPageError: true, error: new Error("Older page unavailable") }); throw new Error("Older page unavailable"); });
  audit.render().content.onLoadMore(); await settle();
  const failed = audit.render();
  assert.equal(failed.content.error, null); assert.equal(failed.content.loadMoreError, "Older page unavailable");
  audit.setPageResult(async () => {}); failed.content.onLoadMore(); await settle(); assert.equal(audit.fetches.length, 2);
});

test("organization-keyed remount resets local controls and late old-scope reads cannot overwrite the destination cache", async () => {
  const sharedCache: Cache = new Map();
  const old = await controller("old-team", sharedCache); const pending = deferred<SecretAuditPage>();
  old.setReadResult(() => pending.promise);
  const view = old.render();
  view.content.onSearchChange("old filter"); view.content.onResourceChange("share");
  view.content.onActorChange("machine"); view.content.onVaultChange("old-vault"); view.content.onOpenEvent(event);
  assert.equal(old.shell().key, "old-team"); assert.equal(old.shell("new-team").key, "new-team");
  const options = old.queryOptions.at(-1)!;
  const oldRead = options.queryFn({ pageParam: firstPage.nextCursor });
  const destination = await controller("new-team", sharedCache);
  const fresh = destination.render();
  assert.equal(fresh.content.search, ""); assert.equal(fresh.sheet.props.event, null);
  for (const filter of ["resource", "actor", "vault"] as const) assert.equal(fresh.content[filter], "all");
  assert.equal(fresh.sheet.props.returnFocusRef.current, null);
  assert.deepEqual(Array.from(destination.queryOptions.at(-1)!.queryKey), ["secrets", "new-team", "audit"]);
  const late = { ...event, id: "old-team-late" };
  pending.resolve({ events: [late], nextCursor: null });
  const page = await oldRead;
  // Model the query boundary writing a completion only to the key captured for that request.
  sharedCache.set(JSON.stringify(options.queryKey), { ...initialQuery(), data: { pages: [page] } });
  assert.deepEqual(destination.render().content.events, [event]);
  assert.equal(destination.render().sheet.props.event, null);
  assert.equal(destination.render().content.search, "");
  assert.deepEqual(old.reads, [{ orgSlug: "old-team", cursor: firstPage.nextCursor }]);
});
