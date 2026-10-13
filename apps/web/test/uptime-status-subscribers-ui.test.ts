import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";

Object.assign(globalThis, { React });
type Element = React.ReactElement<any>;
type Subscriber = {
  id: string; email: string; status: "pending" | "confirmed" | "unsubscribed";
  createdAt: string; confirmedAt: string | null; unsubscribedAt: string | null; lastSentAt: string | null;
};
const subscribers: Subscriber[] = [
  { id: "confirmed-one", email: "confirmed@example.invalid", status: "confirmed", createdAt: "2026-10-10T10:00:00Z", confirmedAt: "2026-10-10T10:01:00Z", unsubscribedAt: null, lastSentAt: "2026-10-12T10:00:00Z" },
  { id: "pending-one", email: "pending@example.invalid", status: "pending", createdAt: "2026-10-11T10:00:00Z", confirmedAt: null, unsubscribedAt: null, lastSentAt: null },
  { id: "unsubscribed-one", email: "unsubscribed@example.invalid", status: "unsubscribed", createdAt: "2026-10-09T10:00:00Z", confirmedAt: "2026-10-09T10:01:00Z", unsubscribedAt: "2026-10-12T11:00:00Z", lastSentAt: null },
];
const response = {
  subscribers, counts: { all: 37, pending: 5, confirmed: 30, unsubscribed: 2 },
  nextCursor: "opaque-next-cursor", subscriptionsEnabled: true,
};
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node as Element, ...elements((node as Element).props.children)];
}
const textOf = (node: React.ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return React.isValidElement(node) ? textOf((node as Element).props.children) : "";
};
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const sourceFile = new URL("../src/components/uptime/status-page-subscribers.tsx", import.meta.url);
class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Exercise the real view and event handlers; replace only its network/hooks and Arc infrastructure. */
async function view(initial: Partial<typeof response> = {}, manage = true) {
  const states: any[] = [], refs: any[] = [], memos: Array<{ dependencies: unknown[]; value: any }> = [];
  const effectSlots: Array<{ dependencies: unknown[] | undefined; cleanup?: () => void }> = [];
  const effects: Array<() => void> = [];
  let stateIndex = 0, refIndex = 0, memoIndex = 0, effectIndex = 0;
  let canManage = manage, resource: any = { ...response, ...initial }, loading = false, error: Error | null = null;
  let mutation: (path: string, init: RequestInit) => Promise<any> = async (path, init) => {
    const body = JSON.parse(String(init.body));
    if (path === "/subscribers/settings") resource = { ...resource, subscriptionsEnabled: body.subscriptionsEnabled };
    else resource = { ...resource, subscribers: resource.subscribers.map((item: Subscriber) => path.endsWith(`/${encodeURIComponent(item.id)}`) ? { ...item, status: body.status } : item) };
    return resource;
  };
  const requests: Array<{ path: string; init?: RequestInit; body: any }> = [];
  const queries: any[] = [];
  let reloads = 0;
  const memo = (factory: () => any, dependencies: unknown[]) => {
    const slot = memoIndex++;
    if (!memos[slot] || dependencies.some((value, index) => !Object.is(value, memos[slot].dependencies[index]))) memos[slot] = { dependencies: Array.from(dependencies), value: factory() };
    return memos[slot].value;
  };
  const react = {
    ...React, useId: () => "subscriber-test", useMemo: memo,
    useCallback: (callback: any, dependencies: unknown[]) => memo(() => callback, dependencies),
    useState(initialValue: any) {
      const slot = stateIndex++;
      if (!(slot in states)) states[slot] = typeof initialValue === "function" ? initialValue() : initialValue;
      return [states[slot], (next: any) => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }];
    },
    useRef: (initialValue: any) => refs[refIndex++] ??= { current: initialValue },
    useEffect(effect: () => void | (() => void), dependencies?: unknown[]) {
      const slot = effectIndex++, previous = effectSlots[slot];
      if (!previous || !dependencies || dependencies.some((value, index) => !Object.is(value, previous.dependencies?.[index]))) {
        effectSlots[slot] = { dependencies: dependencies && Array.from(dependencies) };
        effects.push(() => { previous?.cleanup?.(); const cleanup = effect(); if (cleanup) effectSlots[slot].cleanup = cleanup; });
      }
    },
  };
  const Button = ({ children, type, disabled, loading: busy, ...props }: any) => React.createElement("button", { type, disabled: disabled || busy, role: props.role, "aria-busy": busy || undefined, "aria-label": props["aria-label"], "aria-checked": props["aria-checked"] }, children);
  const Search = ({ label, value, disabled }: any) => React.createElement("input", { type: "search", "aria-label": label, value, disabled, readOnly: true });
  const Select = ({ label, value, options, disabled }: any) => React.createElement("select", { "aria-label": label, value, disabled, onChange() {} }, options?.map((option: any) => React.createElement("option", { key: option.value, value: option.value }, option.label)));
  const Segmented = ({ label, value, options, disabled }: any) => React.createElement("div", { role: "group", "aria-label": label }, options?.map((option: any) => React.createElement("button", { key: option.value, "aria-pressed": option.value === value, disabled }, option.label, option.accessory)));
  const Switch = ({ label, checked, disabled, ...props }: any) => React.createElement("input", { type: "checkbox", role: "switch", "aria-label": label || props["aria-label"], checked, disabled });
  const Dialog = ({ open, title, children, footer, busy }: any) => open ? React.createElement("section", { role: "dialog", "aria-label": title, "aria-busy": busy || undefined }, React.createElement("h2", null, title), children, footer) : null;
  const Panel = ({ children, ...props }: any) => React.createElement("section", { className: props.className }, children);
  const Skeleton = ({ label, children }: any) => React.createElement("section", { role: "status", "aria-label": label }, children);
  const uptimeRequest = async (_org: string, path: string, init?: RequestInit) => {
    requests.push({ path, init, body: init?.body ? JSON.parse(String(init.body)) : null });
    return init?.method ? mutation(path, init) : resource;
  };
  const context = () => ({ orgSlug: "acme", page: { id: "page-one", name: "Acme status", published: true, subscriptionsEnabled: resource?.subscriptionsEnabled ?? true }, canManage, reload() { reloads++; } });
  const queryClient = { invalidateQueries: async () => { reloads++; }, setQueryData(_key: any, value: any) { resource = typeof value === "function" ? value(resource) : value; }, setQueriesData(_filter: any, value: any) { resource = typeof value === "function" ? value(resource) : value; } };
  const modules: Record<string, unknown> = {
    react, "lucide-react": icons,
    "motion/react": { motion: new Proxy({}, { get: (_target, name: string) => ({ children, ...props }: any) => React.createElement(name, { role: props.role, "aria-hidden": props["aria-hidden"], "aria-label": props["aria-label"], "aria-checked": props["aria-checked"], disabled: props.disabled }, children) }), useReducedMotion: () => false },
    "@tanstack/react-query": { useQuery: (options: any) => { queries.push(options); return { data: resource, isPending: loading, isLoading: loading, isFetching: loading, isError: Boolean(error), error, refetch: async () => { reloads++; }, dataUpdatedAt: Date.parse("2026-10-13T10:00:00Z") }; }, useQueryClient: () => queryClient },
    "@tanstack/react-router": { Link: ({ to, children }: any) => React.createElement("a", { href: to }, children) },
    "@/components/arc/button/button": { Button }, "@/components/arc/search-field/search-field": { SearchField: Search },
    "@/components/arc/select/select": { Select }, "@/components/arc/segmented-control/segmented-control": { __esModule: true, default: Segmented },
    "@/components/arc/toggle/toggle": { Switch, Toggle: Switch },
    "@/components/ui/arc-switch": { ArcSwitch: Switch },
  };
  const source = await readFile(sourceFile, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, Error, Date, URLSearchParams, AbortController, module, exports: module.exports,
    requestAnimationFrame: (callback: () => void) => callback(), document: { getElementById: () => ({ focus() {} }) },
    require: (name: string) => {
      if (name.endsWith("/status-page-editor-context") || name === "./status-page-editor-context") return { useStatusPageEditor: context };
      if (name.endsWith("/uptime-client") || name === "./uptime-client") return { uptimeRequest, UptimeRequestError: RequestError, formatTime: (value: string | null) => value || "Never", useUptimeResource: (_org: string, path: string) => { queries.push({ path }); return { data: resource, loading, error, reload: () => { reloads++; } }; } };
      if (name.endsWith("/uptime-dialog") || name === "./uptime-dialog") return { UptimeDialog: Dialog };
      if (name.endsWith("/uptime-ui") || name === "./uptime-ui") return { UptimePanel: Panel, UptimeError: ({ message }: any) => React.createElement("p", { role: "alert" }, message), labelClass: "label" };
      if (name.endsWith("/uptime-skeleton") || name === "./uptime-skeleton") return { UptimeSkeleton: Skeleton, UptimeHeaderSkeleton: Skeleton, UptimeRowsSkeleton: Skeleton };
      assert.ok(Object.hasOwn(modules, name), `Unexpected subscribers dependency: ${name}`);
      return modules[name];
    },
  });
  const render = () => { stateIndex = refIndex = memoIndex = effectIndex = 0; return module.exports.StatusPageSubscribers(); };
  return {
    Button, Search, Select, Segmented, Switch, Dialog, requests, queries, render,
    nodes: () => elements(render()), html: () => renderToStaticMarkup(render()),
    commit: () => effects.splice(0).forEach((effect) => effect()),
    mutate: (callback: typeof mutation) => { mutation = callback; },
    setManage: (value: boolean) => { canManage = value; },
    setResource: (value: any) => { resource = value; },
    fail: (message: string, status?: number) => { error = status ? new RequestError(message, status) : new Error(message); },
    setLoading: (value: boolean) => { loading = value; },
    get reloads() { return reloads; },
  };
}

test("subscribers is a dedicated status-page editor route and tab", async () => {
  const [parent, route, generated] = await Promise.all([
    readFile(new URL("../src/routes/$orgSlug/uptime/status-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/$orgSlug/uptime/status-page/subscribers.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8"),
  ]);
  assert.match(parent, /label: "Subscribers", to: "\/\$orgSlug\/uptime\/status-page\/subscribers"/);
  assert.match(route, /createFileRoute\("\/\$orgSlug\/uptime\/status-page\/subscribers"\)/);
  assert.match(route, /component: StatusPageSubscribers/);
  assert.match(route, /Status page subscribers - OutRay Uptime/);
  assert.match(generated, /\/\$orgSlug\/uptime\/status-page\/subscribers/);
});

test("members never see subscriber PII or activate a subscriber request, even with cached manager data", async () => {
  const runtime = await view({}, false);
  const html = runtime.html();
  runtime.commit();
  for (const item of subscribers) assert.ok(!html.includes(item.email));
  assert.match(html, /owners and admins/i);
  assert.doesNotMatch(html, /Allow subscriptions|Unsubscribe this address|type="search"/);
  assert.equal(runtime.requests.length, 0);
  assert.ok(runtime.queries.every((query) => query.enabled === false), "subscriber queries must be explicitly disabled for non-managers");
});

test("permission loss immediately removes cached subscriber addresses and management controls", async () => {
  const runtime = await view();
  assert.match(runtime.html(), /confirmed@example\.invalid/);
  runtime.setManage(false);
  const html = runtime.html();
  for (const item of subscribers) assert.ok(!html.includes(item.email));
  assert.doesNotMatch(html, /Allow subscriptions|type="search"/);
  assert.equal(runtime.queries.at(-1)?.enabled, false);
});

test("the administrator view separates consent statuses and server-wide counts from its paginated rows", async () => {
  const runtime = await view();
  const html = runtime.html();
  for (const item of subscribers) assert.ok(html.includes(item.email));
  for (const status of ["All", "Pending", "Confirmed", "Unsubscribed"]) assert.ok(html.includes(status));
  for (const count of [37, 5, 30, 2]) assert.ok(new RegExp(`>${count}<`).test(html), `Missing server-wide ${count} count`);
  assert.match(html, /role="switch"[^>]*aria-checked="true"/);
  assert.match(html, /Allow subscriptions/);
  assert.doesNotMatch(html, /Resubscribe|Confirm subscriber|token_hash|tokenHash|token_expires_at|ip_hash/i);
});

test("search and consent filters reset pagination and encode bounded requests", async () => {
  const runtime = await view();
  const nodes = () => runtime.nodes();
  const next = () => nodes().find((node) => node.type === runtime.Button && /Next/.test(textOf(node.props.children)))!;
  assert.ok(next());
  next().props.onClick();
  nodes();
  assert.equal(runtime.queries.at(-1)?.queryKey.at(-1), response.nextCursor);
  nodes().find((node) => node.type === runtime.Search)!.props.onValueChange("  a+b@example.invalid  ");
  nodes();
  const searchQuery = runtime.queries.at(-1);
  assert.equal(searchQuery.queryKey.at(-1), null);
  assert.ok(searchQuery.queryKey.includes("a+b@example.invalid"));
  await searchQuery.queryFn({ signal: new AbortController().signal });
  const path = new URL(runtime.requests.at(-1)!.path, "http://localhost");
  assert.equal(path.searchParams.get("q"), "a+b@example.invalid");
  assert.equal(path.searchParams.get("limit"), "25");
  assert.equal(path.searchParams.has("cursor"), false);
  next().props.onClick(); nodes();
  const filter = nodes().find((node) => node.type === runtime.Segmented || node.type === runtime.Select)!;
  assert.ok(filter);
  filter.props.onValueChange("pending");
  nodes();
  const filterQuery = runtime.queries.at(-1);
  assert.equal(filterQuery.queryKey.at(-1), null);
  assert.ok(filterQuery.queryKey.includes("pending"));
  await filterQuery.queryFn({ signal: new AbortController().signal });
  const filtered = new URL(runtime.requests.at(-1)!.path, "http://localhost");
  assert.equal(filtered.searchParams.get("status"), "pending");
  assert.equal(filtered.searchParams.has("cursor"), false);
});

test("previous pagination restores its exact cursor and the first page cannot go backwards", async () => {
  const runtime = await view();
  const find = (name: string) => runtime.nodes().find((node) => node.type === runtime.Button && textOf(node.props.children) === name)!;
  assert.equal(find("Previous").props.disabled, true);
  find("Next").props.onClick();
  runtime.nodes();
  assert.equal(runtime.queries.at(-1)?.queryKey.at(-1), response.nextCursor);
  assert.equal(find("Previous").props.disabled, false);
  find("Previous").props.onClick();
  runtime.nodes();
  assert.equal(runtime.queries.at(-1)?.queryKey.at(-1), null);
  assert.equal(find("Previous").props.disabled, true);
});

for (const status of [401, 403]) {
  test(`a fresh ${status} response hides previously loaded emails instead of leaving a stale administrative view`, async () => {
    const runtime = await view();
    assert.match(runtime.html(), /confirmed@example\.invalid/);
    runtime.fail("You cannot view subscriber email addresses", status);
    const html = runtime.html();
    assert.match(html, /Subscriber access is restricted/);
    for (const item of subscribers) assert.ok(!html.includes(item.email));
    assert.doesNotMatch(html, /Allow subscriptions|type="search"/);
  });
}

test("turning subscriptions off requires explicit confirmation and cancellation is non-mutating", async () => {
  const runtime = await view();
  const toggle = runtime.nodes().find((node) => node.props.role === "switch")!;
  assert.equal(toggle.props["aria-checked"], true);
  toggle.props.onClick();
  assert.equal(runtime.requests.length, 0);
  const dialog = runtime.nodes().find((node) => node.type === runtime.Dialog && node.props.open)!;
  assert.equal(dialog.props.title, "Turn off subscriptions?");
  const html = runtime.html();
  assert.match(html, /Get updates will be hidden/);
  assert.match(html, /New signups and subscriber emails will pause/);
  assert.match(html, /subscriber list and existing consent are retained/);
  const cancel = elements(dialog.props.footer).find((node) => textOf(node.props.children) === "Cancel")!;
  assert.equal(cancel.props["data-autofocus"], true, "the safe action must receive initial focus");
  cancel.props.onClick();
  assert.equal(runtime.nodes().find((node) => node.type === runtime.Dialog)?.props.open, false);
  assert.equal(runtime.requests.length, 0);
});

test("disable requests are single-flight, lock dismissal, and preserve existing subscriber consent", async () => {
  const runtime = await view();
  let resolve!: (value: { subscriptionsEnabled: boolean }) => void;
  runtime.mutate(() => new Promise((done) => { resolve = done; }));
  runtime.nodes().find((node) => node.props.role === "switch")!.props.onClick();
  const dialog = runtime.nodes().find((node) => node.type === runtime.Dialog && node.props.open)!;
  const confirm = elements(dialog.props.footer).find((node) => textOf(node.props.children) === "Turn off subscriptions")!;
  confirm.props.onClick(); confirm.props.onClick();
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.requests[0].path, "/subscribers/settings");
  assert.equal(runtime.requests[0].init?.method, "PATCH");
  assert.deepEqual(runtime.requests[0].body, { subscriptionsEnabled: false });
  let current = runtime.nodes().find((node) => node.type === runtime.Dialog)!;
  assert.equal(current.props.busy, true);
  current.props.onClose();
  current = runtime.nodes().find((node) => node.type === runtime.Dialog)!;
  assert.equal(current.props.open, true, "busy dismissal must not hide the in-flight setting change");
  assert.equal(runtime.nodes().find((node) => node.props.role === "switch")!.props.disabled, true);
  resolve({ subscriptionsEnabled: false }); await flush();
  const html = runtime.html();
  assert.match(html, /role="switch"[^>]*aria-checked="false"/);
  assert.match(html, /Subscriptions are off/);
  assert.match(html, /New signups and subscriber emails are paused/);
  for (const item of subscribers) assert.ok(html.includes(item.email), "disabling subscriptions must preserve the list");
  assert.match(html, /Confirmed|Pending|Unsubscribed/);
  assert.ok(runtime.reloads >= 2, "both the editor page and subscriber caches must refresh");
  assert.equal(runtime.nodes().find((node) => node.type === runtime.Dialog)?.props.open, false);
});

test("a failed disable preserves the enabled setting, dialog context and retry path without announcing success", async () => {
  const runtime = await view();
  runtime.mutate(async () => { throw new Error("Setting could not be saved"); });
  runtime.nodes().find((node) => node.props.role === "switch")!.props.onClick();
  let dialog = runtime.nodes().find((node) => node.type === runtime.Dialog && node.props.open)!;
  elements(dialog.props.footer).find((node) => textOf(node.props.children) === "Turn off subscriptions")!.props.onClick();
  await flush();
  const html = runtime.html();
  assert.match(html, /Setting could not be saved/);
  assert.match(html, /role="switch"[^>]*aria-checked="true"/);
  assert.doesNotMatch(html, /Subscriptions are off\./);
  dialog = runtime.nodes().find((node) => node.type === runtime.Dialog && node.props.open)!;
  assert.equal(dialog.props.title, "Turn off subscriptions?");
  assert.equal(dialog.props.busy, false);
  assert.equal(runtime.reloads, 0);
  runtime.mutate(async () => ({ subscriptionsEnabled: false }));
  elements(dialog.props.footer).find((node) => textOf(node.props.children) === "Turn off subscriptions")!.props.onClick();
  await flush();
  assert.match(runtime.html(), /Subscriptions are off\./);
  assert.equal(runtime.requests.length, 2);
});

test("turning subscriptions on only changes the setting, never confirms or restores subscriber consent", async () => {
  const runtime = await view({ subscriptionsEnabled: false });
  assert.match(runtime.html(), /Get updates is hidden/);
  const toggle = runtime.nodes().find((node) => node.props.role === "switch")!;
  assert.equal(toggle.props["aria-checked"], false);
  toggle.props.onClick(); await flush();
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.requests[0].path, "/subscribers/settings");
  assert.deepEqual(runtime.requests[0].body, { subscriptionsEnabled: true });
  assert.match(runtime.html(), /role="switch"[^>]*aria-checked="true"/);
  assert.match(runtime.html(), /Subscriptions are on/);
  assert.ok(runtime.html().includes("unsubscribed@example.invalid"));
  assert.equal(runtime.nodes().filter((node) => node.props["aria-label"] === "Unsubscribe unsubscribed@example.invalid").length, 0);
  assert.equal(runtime.nodes().find((node) => node.type === runtime.Dialog)?.props.open, false);
});

test("confirmed and pending addresses can be unsubscribed only through an explicit, single-flight confirmation", async () => {
  for (const subscriber of subscribers.filter((item) => item.status !== "unsubscribed")) {
    const runtime = await view();
    let resolve!: (value: {}) => void;
    runtime.mutate(() => new Promise((done) => { resolve = done; }));
    const launcher = runtime.nodes().find((node) => node.props["aria-label"] === `Unsubscribe ${subscriber.email}`)!;
    assert.ok(launcher);
    launcher.props.onClick();
    assert.equal(runtime.requests.length, 0);
    let dialog = runtime.nodes().find((node) => node.type === runtime.Dialog && node.props.open)!;
    assert.equal(dialog.props.title, "Unsubscribe this address?");
    assert.match(runtime.html(), new RegExp(subscriber.email.replaceAll(".", "\\.")));
    assert.match(runtime.html(), /must sign up and confirm again/);
    const confirm = elements(dialog.props.footer).find((node) => textOf(node.props.children) === "Unsubscribe")!;
    confirm.props.onClick(); confirm.props.onClick();
    assert.equal(runtime.requests.length, 1);
    assert.equal(runtime.requests[0].path, `/subscribers/${subscriber.id}`);
    assert.equal(runtime.requests[0].init?.method, "PATCH");
    assert.deepEqual(runtime.requests[0].body, { status: "unsubscribed" });
    dialog = runtime.nodes().find((node) => node.type === runtime.Dialog)!;
    assert.equal(dialog.props.busy, true);
    dialog.props.onClose();
    assert.equal(runtime.nodes().find((node) => node.type === runtime.Dialog)?.props.open, true);
    resolve({}); await flush();
    assert.equal(runtime.nodes().find((node) => node.type === runtime.Dialog)?.props.open, false);
    assert.match(runtime.html(), /The address is unsubscribed/);
    assert.ok(runtime.reloads > 0);
  }
});

test("failed unsubscribe keeps its selected address and consent state without a success notice", async () => {
  const runtime = await view();
  runtime.mutate(async () => { throw new Error("Address could not be unsubscribed"); });
  runtime.nodes().find((node) => node.props["aria-label"] === "Unsubscribe confirmed@example.invalid")!.props.onClick();
  const dialog = runtime.nodes().find((node) => node.type === runtime.Dialog && node.props.open)!;
  elements(dialog.props.footer).find((node) => textOf(node.props.children) === "Unsubscribe")!.props.onClick();
  await flush();
  const html = runtime.html();
  assert.match(html, /Address could not be unsubscribed/);
  assert.doesNotMatch(html, /The address is unsubscribed\./);
  const current = runtime.nodes().find((node) => node.type === runtime.Dialog && node.props.open)!;
  assert.equal(current.props.title, "Unsubscribe this address?");
  assert.equal(current.props.busy, false);
  assert.ok(textOf(current.props.children).includes("confirmed@example.invalid"));
  assert.ok(runtime.nodes().some((node) => node.props["aria-label"] === "Unsubscribe confirmed@example.invalid"));
  assert.equal(runtime.reloads, 0);
});

test("refresh failures keep the last administrative list, disable setting changes and offer an explicit retry", async () => {
  const runtime = await view();
  runtime.fail("Subscriber service unavailable");
  const html = runtime.html();
  assert.match(html, /Could not refresh subscribers\. Showing the last loaded list/);
  assert.match(html, /Subscriber service unavailable/);
  assert.match(html, /confirmed@example\.invalid/);
  assert.equal(runtime.nodes().find((node) => node.props.role === "switch")!.props.disabled, true);
  runtime.nodes().find((node) => node.type === runtime.Button && textOf(node.props.children) === "Try again")!.props.onClick();
  await flush();
  assert.equal(runtime.reloads, 1);
  assert.equal(runtime.requests.length, 0);
});

test("empty and filtered-empty states explain signup availability instead of inventing subscriber records", async () => {
  const runtime = await view({ subscribers: [], nextCursor: null, counts: { all: 0, pending: 0, confirmed: 0, unsubscribed: 0 } });
  assert.match(runtime.html(), /No subscribers yet/);
  assert.match(runtime.html(), /when subscriptions are on/);
  runtime.nodes().find((node) => node.type === runtime.Search)!.props.onValueChange("missing@example.invalid");
  assert.match(runtime.html(), /No subscribers match your filters/);
  assert.match(runtime.html(), /Try another email or subscription status/);
  assert.doesNotMatch(runtime.html(), /<tbody>/);
});

test("initial subscriber loading exposes a status and locks the setting until the authoritative response arrives", async () => {
  const runtime = await view();
  runtime.setResource(undefined);
  runtime.setLoading(true);
  const html = runtime.html();
  assert.match(html, /role="status" aria-label="Loading subscribers"/);
  assert.doesNotMatch(html, /No subscribers yet|<tbody>|confirmed@example\.invalid/);
  const toggle = runtime.nodes().find((node) => node.props.role === "switch")!;
  assert.equal(toggle.type, runtime.Button);
  assert.equal(toggle.props.type, "button");
  assert.equal(toggle.props["aria-label"], "Allow subscriptions");
  assert.equal(toggle.props["aria-describedby"], "subscriptions-setting-help");
  assert.equal(toggle.props.disabled, true);
});
