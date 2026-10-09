import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TokensContent, type TokensContentProps } from "../src/components/workspace/tokens-content";
import { TokenCreationForm, TokenReveal, type TokenCreationFormProps } from "../src/components/create-token-modal";
import * as tokenData from "../src/components/workspace/tokens-data";
import type { AuthToken } from "../src/lib/app-client";

Object.assign(globalThis, { React });
const now = Date.parse("2026-10-09T12:00:00Z");
const noop = () => {};

function token(id: string, overrides: Partial<AuthToken> = {}): AuthToken {
  return { id, name: "Production deploy " + id, prefix: "outray_abc123de", scopes: ["tunnel:connect"], organizationId: "org-acme", projectId: null, environmentId: null, createdById: "owner", createdAt: "2026-10-01T12:00:00Z", expiresAt: "2026-12-01T12:00:00Z", revokedAt: null, lastUsedAt: "2026-10-08T12:00:00Z", ...overrides };
}
const inventory = [
  token("active", { scopes: ["tunnel:connect", "observability:write", "secrets:read", "secrets:write", "secrets:delete"], projectId: "vault-api" }),
  token("expired", { name: "CI ingest", scopes: ["observability:write"], expiresAt: "2026-10-09T12:00:00Z", lastUsedAt: null }),
  token("revoked", { name: "Old Secrets token", scopes: ["secrets:read"], environmentId: "env-live", projectId: "vault-api", expiresAt: null, revokedAt: "2026-10-08T00:00:00Z" }),
];

function render(overrides: Partial<TokensContentProps> = {}) {
  return renderToStaticMarkup(React.createElement(TokensContent, { tokens: inventory, loading: false, refreshing: false, error: null, canManage: true, permissionPending: false, search: "", status: "all", now, onSearchChange: noop, onStatusChange: noop, onCreate: noop, onRevoke: noop, onRetry: noop, ...overrides }));
}
const rows = (html: string) => [...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(([row]) => row);
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);

test("token catalog uses the compact console header, product groups, masked prefixes, and three distinct states", () => {
  const html = render();
  assert.match(html, /<h1[^>]*>API tokens<\/h1>/);
  assert.match(html, /max-w-\[1440px\]/);
  assert.doesNotMatch(html, />Workspace<\/p>/);
  const list = rows(html);
  assert.equal(list.length, 3);
  assert.match(list[0], /data-token-status="active"/); assert.match(list[0], />Active<\/span>/);
  assert.match(list[1], /data-token-status="expired"/); assert.match(list[1], />Expired<\/span>/);
  assert.match(list[2], /data-token-status="revoked"/); assert.match(list[2], />Revoked<\/span>/);
  assert.match(list[0], /outray_abc123de••••••••/);
  assert.match(list[0], /Tunnels/); assert.match(list[0], /Observability/); assert.match(list[0], /read, write, delete/);
  assert.match(list[0], /Secrets · One vault/); assert.match(list[2], /Secrets · One environment/);
  assert.match(list[1], /Never used/); assert.match(list[2], /No expiry/);
  assert.equal(buttons(html).filter((button) => /aria-label="Revoke /.test(button)).length, 2);
  assert.match(list[0], /dateTime="2026-12-01T12:00:00.000Z" title="[^"]+"/);
  assert.match(html, /class="button primary md/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /Only masked prefixes are shown/);
});

test("token metadata does not expose full credentials and malformed dates never reach time elements", () => {
  const full = "outray_abc123def_private-full-credential";
  const html = render({ tokens: [token("unsafe-prefix", { prefix: full, expiresAt: "invalid", lastUsedAt: "invalid" })] });
  assert.doesNotMatch(html, /private-full-credential|dateTime="invalid"/);
  assert.match(html, /outray_abc123de••••••••/);
  assert.match(html, /Unknown/);
  assert.equal(tokenData.maskedTokenPrefix(full), "outray_abc123de••••••••");
});

test("search and status filters are labeled, deterministic, and do not mutate query metadata", () => {
  const snapshot = JSON.stringify(inventory);
  const named = render({ search: " production " });
  assert.equal(rows(named).length, 1);
  assert.match(named, /1 of 3 tokens/);
  const searchId = named.match(/<label for="([^"]+)">Search API tokens<\/label>/)?.[1];
  assert.ok(searchId);
  assert.match(named, new RegExp('id="' + searchId + '"[^>]*type="search"|type="search"[^>]*id="' + searchId + '"'));
  assert.match(named, /maxLength="200"/); assert.match(named, /autoComplete="off"/);
  assert.match(named, /Filter token status/); assert.match(named, /role="combobox"/);
  assert.equal(rows(render({ status: "expired" })).length, 1);
  assert.equal(rows(render({ search: "SECRETS", status: "active" })).length, 1);
  const unmatched = render({ search: "no-match", status: "revoked" });
  assert.match(unmatched, /No matching tokens/); assert.match(unmatched, /Clear filters/);
  assert.equal(rows(unmatched).length, 0);
  assert.equal(JSON.stringify(inventory), snapshot);
  assert.equal(tokenData.tokenStatus(inventory[1], now), "expired", "expiry is inclusive");
  assert.equal(tokenData.tokenStatus(token("both", { revokedAt: "2026-10-01", expiresAt: "2026-10-01" }), now), "revoked", "revocation wins over expiry");
});

test("loading, errors, an empty inventory, missing permission, and stale refresh are distinct states", () => {
  const loading = render({ tokens: null, loading: true, refreshing: true });
  assert.match(loading, /aria-label="Loading API tokens" aria-busy="true"/);
  assert.doesNotMatch(loading, /No API tokens yet|0 tokens|type="search"/);
  const failure = render({ tokens: null, error: "Offline test failure" });
  assert.match(failure, /role="alert"/); assert.match(failure, /Offline test failure/); assert.match(failure, /Try again/);
  assert.doesNotMatch(failure, /No API tokens yet/);
  const empty = render({ tokens: [] });
  assert.match(empty, /No API tokens yet/); assert.match(empty, /Create token/);
  assert.doesNotMatch(empty, /Try again|type="search"/);
  const denied = render({ canManage: false });
  assert.match(denied, /Token management is restricted/);
  assert.doesNotMatch(denied, /New token|Revoke Production|outray_abc123de|type="search"/);
  const pending = render({ canManage: false, permissionPending: true });
  assert.match(pending, /Loading API tokens/); assert.doesNotMatch(pending, /restricted|New token/);
  const stale = render({ refreshing: true, error: "Temporary refresh failure" });
  assert.equal(rows(stale).length, 3);
  assert.match(stale, /Showing the last available metadata/); assert.match(stale, /Retry/);
  assert.match(stale, /Updating tokens/); assert.doesNotMatch(stale, /Loading API tokens/);
});

function formProps(overrides: Partial<TokenCreationFormProps> = {}): TokenCreationFormProps {
  return { formId: "create-api-token", name: "Deploy", scopes: ["secrets:read"], boundary: "environment", projectId: "vault-api", environmentId: "env-live", expiresIn: "90d", busy: false, error: null,
    projects: [{ id: "vault-api", name: "API", slug: "api" }], projectsLoading: false, projectsError: null, environments: [{ id: "env-live", name: "Live", slug: "live" }], environmentsLoading: false, environmentsError: null,
    onNameChange: noop, onScopeChange: noop, onBoundaryChange: noop, onProjectChange: noop, onEnvironmentChange: noop, onExpiryChange: noop, onRetryProjects: noop, onRetryEnvironments: noop, onSubmit: noop, ...overrides };
}

test("creation fields retain real checkbox semantics, compact name input, custom selects, and vault/environment boundaries", () => {
  const html = renderToStaticMarkup(React.createElement(TokenCreationForm, formProps()));
  const checkbox = [...html.matchAll(/<input\b[^>]*type="checkbox"[^>]*>/g)].map(([input]) => input);
  assert.equal(checkbox.length, 5);
  assert.equal(checkbox.filter((input) => /checked/.test(input)).length, 1);
  for (const input of checkbox) assert.match(input, /name="scopes"/);
  assert.match(html, /<legend[^>]*>Permissions<\/legend>/);
  assert.match(html, /data-field-size="compact"/); assert.match(html, /maxLength="100"/);
  assert.match(html, /<label[^>]*>Token name<\/label>/);
  assert.equal(buttons(html).filter((button) => /role="combobox"/.test(button)).length, 4);
  assert.match(html, /Resource scope/); assert.match(html, /Expires after/); assert.match(html, />90 days/);
  assert.match(html, /Vault/); assert.match(html, /Environment/); assert.match(html, />API/); assert.match(html, />Live/);
  assert.match(html, /limits apply to Secrets/); assert.match(html, /Tunnels and observability remain workspace-wide/);
  assert.doesNotMatch(html, /autoFocus|autofocus/);
  for (const [select] of html.matchAll(/<select\b[^>]*>/g)) assert.match(select, /aria-hidden="true"/);
  const failed = renderToStaticMarkup(React.createElement(TokenCreationForm, formProps({ projectsError: "Vault options failed", environmentsError: "Environment options failed" })));
  assert.match(failed, /Vault options failed/); assert.match(failed, /Environment options failed/);
  for (const retry of buttons(failed).filter((button) => /Retry vaults|Retry environments/.test(button))) assert.match(retry, /type="button"/);
  const empty = renderToStaticMarkup(React.createElement(TokenCreationForm, formProps({ projects: [], environments: [], projectId: "", environmentId: "" })));
  assert.match(empty, /No vaults are available/);
});

test("creation validation requires authorized option matches and never widens a Secrets boundary", () => {
  const valid = { name: "Deploy", scopes: ["secrets:read"] as AuthToken["scopes"], boundary: "environment" as const, projectValid: true, environmentValid: true };
  assert.equal(tokenData.canCreateToken(valid), true);
  for (const override of [{ name: " " }, { name: "x".repeat(101) }, { scopes: [] }, { projectValid: false }, { environmentValid: false }, { scopes: ["tunnel:connect"] as AuthToken["scopes"] }]) assert.equal(tokenData.canCreateToken({ ...valid, ...override }), false);
  assert.equal(tokenData.canCreateToken({ ...valid, boundary: "project", environmentValid: false }), true);
  assert.equal(tokenData.canCreateToken({ ...valid, boundary: "organization", projectValid: false, environmentValid: false }), true);
});

test("one-time reveal starts with the token prefix, uses icon-only Arc copy, and has no recovery after hiding", () => {
  const credential = "outray_synthetic_test_credential";
  const html = renderToStaticMarkup(React.createElement(TokenReveal, { token: credential, copyError: null, onCopyError: noop, onCopied: noop }));
  assert.match(html, /ph-no-capture/); assert.match(html, /<code>outray_synthetic_test_credential<\/code>/);
  assert.match(html, /overflow-x-auto whitespace-pre/);
  const copy = buttons(html).find((button) => /aria-label="Copy token"/.test(button));
  assert.ok(copy); assert.match(copy, /iconOnly/);
  assert.doesNotMatch(copy, />Copy<|>Copied</); assert.doesNotMatch(html, /<input\b|autoFocus|autofocus/);
  assert.match(html, /hidden after 30 seconds/);
  const hidden = renderToStaticMarkup(React.createElement(TokenReveal, { token: null, copyError: null, onCopyError: noop, onCopied: noop }));
  assert.match(hidden, /Token hidden/); assert.match(hidden, /cannot be shown again/);
  assert.doesNotMatch(hidden, /synthetic_test_credential|<code\b|Copy token|Create token/);
});

type Element = React.ReactElement<Record<string, any>>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const value = node as Element;
  return [value, ...elements(value.props.children)];
}

/** Runs real token controller handlers with inert UI/query primitives and synthetic API responses only. */
async function controller(kind: "create" | "revoke") {
  const source = await readFile(new URL(kind === "create" ? "../src/components/create-token-modal.tsx" : "../src/routes/$orgSlug/tokens.tsx", import.meta.url), "utf8");
  const name = kind === "create" ? "TokenCreationSession" : "TokensSettingsController";
  const compiled = ts.transpileModule(source + "\nexport { " + name + " };", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const values: any[] = []; let index = 0;
  let permission = { data: true, isPending: false };
  let createResponse: (data: any) => Promise<any> = async () => ({ token: "outray_synthetic_created", machineToken: token("created") });
  let revokeResponse: (data: any) => Promise<any> = async () => ({ success: true });
  const createCalls: any[] = []; const revokeCalls: any[] = []; const queryOptions: any[] = []; const invalidations: any[] = [];
  const timers = new Map<number, () => void>(); let timerId = 0;
  const cleanups: Array<() => void> = [];
  const stubs = Object.fromEntries(["Button", "CopyButton", "Select", "WorkspaceInput", "WorkspaceDialog", "WorkspaceNotice", "TokensContent", "CreateTokenModal"].map((name) => [name, () => null]));
  let mutationOptions: any; let error: Error | null = null; let pending = false; let cache: AuthToken[] = inventory;
  const mutation = {
    get isPending() { return pending; }, get error() { return error; }, reset() { error = null; },
    async mutateAsync(id: string) {
      pending = true; error = null;
      try { await mutationOptions.mutationFn(id); mutationOptions.onSuccess(undefined, id); }
      catch (caught) { error = caught as Error; throw caught; }
      finally { pending = false; }
    },
  };
  const hooks = {
    ...React,
    useId: () => "token-form",
    useState(initial: any) { const slot = index++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial; return [values[slot], (next: any) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; },
    useRef(initial: any) { const slot = index++; return values[slot] ?? (values[slot] = { current: initial }); },
    useEffect(callback: () => (() => void), _deps: unknown[]) { const slot = index++; if (!(slot in values)) { values[slot] = true; cleanups.push(callback()); } },
  };
  const module = { exports: {} as Record<string, (props: any) => React.ReactNode> };
  runInNewContext(compiled, {
    React, module, exports: module.exports, Error, Date,
    setTimeout(callback: () => void, milliseconds: number) { assert.equal(milliseconds, 30_000); const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id: number) { timers.delete(id); }, setInterval: () => 1, clearInterval: noop,
    require(specifier: string) {
      if (specifier === "react") return hooks;
      if (specifier === "@tanstack/react-router") return { createFileRoute: () => () => ({}) };
      if (specifier === "@/lib/auth-client") return { usePermission: () => permission };
      if (specifier === "@/lib/app-client") return { appClient: { authTokens: { create: (data: any) => { createCalls.push(data); return createResponse(data); }, revoke: (data: any) => { revokeCalls.push(data); return revokeResponse(data); }, list: async () => ({ tokens: inventory }) } } };
      if (specifier === "@tanstack/react-query") return {
        useQuery: (options: any) => { queryOptions.push(options); return { data: options.queryKey[0] === "auth-tokens" ? inventory : [], dataUpdatedAt: now, isLoading: false, isFetching: false, error: null, refetch: noop }; },
        useMutation: (options: any) => { mutationOptions = options; return mutation; },
        useQueryClient: () => ({ invalidateQueries: (options: any) => { invalidations.push(options); }, setQueryData: (_key: any, updater: (data: AuthToken[]) => AuthToken[]) => { cache = updater(cache); } }),
      };
      if (specifier === "@/components/workspace/tokens-data") return tokenData;
      if (specifier === "lucide-react") return { Check: () => null, KeyRound: () => null, RefreshCw: () => null };
      if (specifier.startsWith("@/components/")) return stubs;
      throw new Error("Unexpected token dependency: " + specifier);
    },
  });
  const props = kind === "create" ? { isOpen: true, orgSlug: "acme", defaultName: "CI ingest", defaultScopes: ["observability:write"], canCreate: true, permissionPending: false, onClose: noop } : { orgSlug: "acme" };
  return { stubs, props, createCalls, revokeCalls, queryOptions, invalidations, timers,
    get cache() { return cache; }, setPermission(next: typeof permission) { permission = next; }, setCreateResponse(next: typeof createResponse) { createResponse = next; }, setRevokeResponse(next: typeof revokeResponse) { revokeResponse = next; },
    render(overrides: any = {}) { index = 0; return elements(module.exports[name]({ ...props, ...overrides })); },
    renderWrapper(overrides: any = {}) { index = 0; return elements(module.exports.CreateTokenModal({ ...props, ...overrides })); },
    dispose() { cleanups.forEach((cleanup) => cleanup()); },
  };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("creation is permission-gated, single-flight, and a failed create stays retryable without dropping fields", async () => {
  const ui = await controller("create");
  let resolveRequest!: (value: any) => void;
  ui.setCreateResponse(() => new Promise((resolve) => { resolveRequest = resolve; }));
  let nodes = ui.render();
  const form = nodes.find((node) => typeof node.type === "function" && node.type.name === "TokenCreationForm")!;
  form.props.onSubmit(); form.props.onSubmit();
  assert.equal(ui.createCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.createCalls[0])), { name: "CI ingest", orgSlug: "acme", scopes: ["observability:write"], expiresIn: "90d", projectId: null, environmentId: null });
  nodes = ui.render();
  assert.equal(nodes.find((node) => node.type === ui.stubs.WorkspaceDialog)?.props.busy, true);
  resolveRequest({ error: "Synthetic create failed" }); await settle();
  nodes = ui.render();
  const failed = nodes.find((node) => typeof node.type === "function" && node.type.name === "TokenCreationForm")!;
  assert.equal(failed.props.error, "Synthetic create failed"); assert.equal(failed.props.name, "CI ingest");
  assert.equal(ui.invalidations.length, 0);
  const denied = ui.render({ canCreate: false });
  assert.ok(denied.some((node) => node.type === ui.stubs.WorkspaceNotice));
  assert.equal(denied.some((node) => typeof node.type === "function" && node.type.name === "TokenCreationForm"), false);
  ui.setPermission({ data: false, isPending: true });
  const wrapper = ui.renderWrapper();
  assert.equal(wrapper[0].props.permissionPending, true); assert.equal(wrapper[0].props.canCreate, false);
  ui.dispose();
});

test("successful creation reveals only in session memory, hides after thirty seconds, and never returns to the create form", async () => {
  const ui = await controller("create");
  let nodes = ui.render();
  nodes.find((node) => typeof node.type === "function" && node.type.name === "TokenCreationForm")!.props.onSubmit();
  await settle(); nodes = ui.render();
  let reveal = nodes.find((node) => typeof node.type === "function" && node.type.name === "TokenReveal")!;
  assert.equal(reveal.props.token, "outray_synthetic_created");
  assert.equal(ui.timers.size, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.invalidations)), [{ queryKey: ["auth-tokens", "acme"] }]);
  [...ui.timers.values()][0](); nodes = ui.render();
  reveal = nodes.find((node) => typeof node.type === "function" && node.type.name === "TokenReveal")!;
  assert.equal(reveal.props.token, null);
  assert.equal(nodes.some((node) => typeof node.type === "function" && node.type.name === "TokenCreationForm"), false);
  const dialog = nodes.find((node) => node.type === ui.stubs.WorkspaceDialog)!;
  const footer = elements(dialog.props.footer);
  assert.equal(footer.length, 1); assert.equal(footer[0].props.size, "sm");
  ui.dispose();
});

test("revocation awaits success, guards repeated requests, retains errors in its open dialog, and obeys permissions", async () => {
  const ui = await controller("revoke");
  let nodes = ui.render();
  nodes.find((node) => node.type === ui.stubs.TokensContent)!.props.onRevoke(inventory[0]);
  nodes = ui.render();
  let dialog = nodes.find((node) => node.type === ui.stubs.WorkspaceDialog)!;
  let resolveRequest!: (value: any) => void;
  ui.setRevokeResponse(() => new Promise((resolve) => { resolveRequest = resolve; }));
  const confirm = elements(dialog.props.footer).find((node) => node.props.variant === "danger")!;
  confirm.props.onClick(); confirm.props.onClick(); dialog.props.onClose();
  assert.equal(ui.revokeCalls.length, 1);
  nodes = ui.render(); dialog = nodes.find((node) => node.type === ui.stubs.WorkspaceDialog)!;
  assert.equal(dialog.props.open, true); assert.equal(dialog.props.busy, true);
  assert.doesNotMatch(dialog.props.description, /immediately|stops every|disconnect/);
  resolveRequest({ error: "Synthetic revoke failed" }); await settle();
  nodes = ui.render(); dialog = nodes.find((node) => node.type === ui.stubs.WorkspaceDialog)!;
  assert.equal(dialog.props.open, true); assert.equal(dialog.props.busy, false);
  assert.ok(nodes.some((node) => node.type === ui.stubs.WorkspaceNotice && node.props.message === "Synthetic revoke failed"));
  ui.setRevokeResponse(async () => ({ success: true }));
  elements(dialog.props.footer).find((node) => node.props.variant === "danger")!.props.onClick(); await settle();
  nodes = ui.render(); dialog = nodes.find((node) => node.type === ui.stubs.WorkspaceDialog)!;
  assert.equal(dialog.props.open, false); assert.ok(ui.cache[0].revokedAt);
  ui.setPermission({ data: false, isPending: false }); nodes = ui.render();
  const content = nodes.find((node) => node.type === ui.stubs.TokensContent)!;
  content.props.onCreate(); content.props.onRevoke(inventory[1]);
  nodes = ui.render(); dialog = nodes.find((node) => node.type === ui.stubs.WorkspaceDialog)!;
  assert.equal(dialog.props.open, false); assert.equal(ui.revokeCalls.length, 2);
  assert.equal(ui.queryOptions.at(-1).enabled, false);
  ui.dispose();
});
