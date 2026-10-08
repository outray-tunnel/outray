import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as recipientData from "../src/components/uptime/email-recipient-data";
import * as uptimeUi from "../src/components/uptime/uptime-ui";
import * as skeletons from "../src/components/uptime/uptime-skeleton";
import * as fields from "../src/components/ui/workspace-input";
import * as icons from "lucide-react";

Object.assign(globalThis, { React });
const members = (count = 20, offset = 0): recipientData.UptimeRecipientMember[] => Array.from({ length: count }, (_, index) => ({ id: `member-${index + offset}`, name: `Person ${index + offset}`, email: `person${index + offset}@example.com`, role: "member" }));
const page = (rows = members(), nextCursor: string | null = "next-cursor"): recipientData.UptimeRecipientPage => ({ members: rows, currentUserId: "owner", nextCursor });

interface QueryOptions {
  queryKey: Array<string | null>;
  queryFn: (context: { signal: AbortSignal }) => Promise<recipientData.UptimeRecipientPage>;
  staleTime: number;
  gcTime: number;
  refetchOnWindowFocus: boolean;
}

interface QueryState {
  data?: recipientData.UptimeRecipientPage;
  isPending: boolean;
  isFetching: boolean;
  error: Error | null;
}

const ready = (pages = [page()]): QueryState => ({ data: pages[0], isPending: false, isFetching: false, error: null });
const normalize = (value: unknown) => JSON.parse(JSON.stringify(value));

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>;
  return [element, ...elements(element.props.children)];
}

/** Real picker and checkbox JSX, with explicit query, hook, and clock boundaries (no browser/DB). */
async function picker(initial = ready()) {
  const source = await readFile(new URL("../src/components/uptime/email-recipients.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const values: any[] = [];
  const cache = new Map<string, QueryState>();
  const timers = new Map<number, () => void>();
  let timerId = 0, hook = 0;
  let props = { orgSlug: "outray-tunnel", value: [] as string[], disabled: false, onChange: (value: string[]) => { props = { ...props, value }; } };
  let queryOptions!: QueryOptions;
  const reads: { orgSlug: string; path: string; init: { signal: AbortSignal } }[] = [];
  const timerDelays: number[] = [];
  let nextCalls = 0, retryCalls = 0;
  let retryResult: () => Promise<any> = async () => ({});
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, Error, Set, URLSearchParams, module, exports: module.exports,
    window: { setTimeout(callback: () => void, delay: number) { timers.set(++timerId, callback); timerDelays.push(delay); return timerId; }, clearTimeout(id: number) { timers.delete(id); } },
    require(specifier: string) {
      if (specifier === "react") return {
        memo: (component: unknown) => component, useId: () => "recipients",
        useState(initialValue: unknown) { const slot = hook++; if (!(slot in values)) values[slot] = typeof initialValue === "function" ? initialValue() : initialValue;
          return [values[slot], (next: unknown) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }]; },
        useRef(initialValue: unknown) { const slot = hook++; return values[slot] ?? (values[slot] = { current: initialValue }); },
        useEffect(effect: () => (() => void), dependencies: unknown[]) {
          const slot = hook++; const previous = values[slot];
          if (!previous || dependencies.some((dependency, position) => !Object.is(dependency, previous.dependencies[position]))) {
            previous?.cleanup?.(); values[slot] = { dependencies, cleanup: effect() };
          }
        },
      };
      if (specifier === "@tanstack/react-query") return { useQuery(options: QueryOptions) {
        queryOptions = options;
        const key = JSON.stringify(options.queryKey);
        if (!cache.has(key)) {
          if (options.queryKey[4]) { nextCalls++; cache.set(key, ready([page(members(20, 20), null)])); }
          else cache.set(key, initial);
        }
        return { ...cache.get(key), refetch: async (options: unknown) => { assert.deepEqual(normalize(options), { cancelRefetch: false }); retryCalls++; return retryResult(); } };
      } };
      if (specifier === "./uptime-client") return { uptimeRequest: async (orgSlug: string, path: string, init: { signal: AbortSignal }) => { reads.push({ orgSlug, path, init }); return page(); } };
      if (specifier === "./email-recipient-data") return recipientData;
      if (specifier === "./uptime-ui") return uptimeUi;
      if (specifier === "./uptime-skeleton") return skeletons;
      if (specifier === "../ui/workspace-input") return fields;
      if (specifier === "lucide-react") return icons;
      throw new Error(`Unexpected recipient dependency: ${specifier}`);
    },
  });
  return {
    render() { hook = 0; return module.exports.UptimeEmailRecipients(props) as React.ReactElement<any>; },
    options() { return queryOptions; }, props() { return props; },
    setProps(next: Partial<typeof props>) { props = { ...props, ...next }; },
    setQuery(next: Partial<QueryState>) { const key = JSON.stringify(queryOptions.queryKey); cache.set(key, { ...cache.get(key)!, ...next }); },
    setRetry(next: typeof retryResult) { retryResult = next; },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); },
    reads, timerDelays, nextCalls: () => nextCalls, retryCalls: () => retryCalls,
  };
}

const settle = async () => { for (let turn = 0; turn < 16; turn++) await Promise.resolve(); };
const byLabel = (tree: React.ReactNode, label: string) => elements(tree).find((node) => node.props["aria-label"] === label)!;

test("recipient requests use bounded pages, opaque encoded cursors, scoped cache keys, and AbortSignal", async () => {
  const harness = await picker(); harness.render();
  const options = harness.options();
  assert.deepEqual(normalize(options.queryKey), ["uptime", "outray-tunnel", "members", "", null]);
  assert.equal(options.staleTime, 60_000); assert.equal(options.gcTime, 300_000); assert.equal(options.refetchOnWindowFocus, false);
  const controller = new AbortController();
  await options.queryFn({ signal: controller.signal });
  const parsed = new URL(harness.reads[0].path, "https://example.com");
  assert.equal(parsed.pathname, "/members"); assert.equal(parsed.searchParams.get("limit"), "20"); assert.equal(parsed.searchParams.get("cursor"), null);
  assert.equal(harness.reads[0].init.signal, controller.signal);
  const opaque = new URL(recipientData.uptimeRecipientPath("a /?β", "opaque /?&β"), "https://example.com");
  assert.equal(opaque.searchParams.get("q"), "a /?β"); assert.equal(opaque.searchParams.get("cursor"), "opaque /?&β");
  harness.setProps({ orgSlug: "acme" }); harness.render();
  assert.deepEqual(normalize(harness.options().queryKey), ["uptime", "acme", "members", "", null]);
});

test("even a 10,001-member legacy-shaped page mounts only 20 checkbox rows", async () => {
  const harness = await picker(ready([page(members(10_001))]));
  const tree = harness.render();
  const html = renderToStaticMarkup(tree);
  assert.equal(elements(tree).filter((node) => node.type === uptimeUi.UptimeCheckbox).length, 20);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 20);
  assert.match(html, /Person 19/); assert.doesNotMatch(html, /Person 20|Person 10000/);
  assert.match(html, /Search team members by name or email/);
});

test("pagination replaces rows rather than accumulating them, and selected recipients survive pages and searches", async () => {
  const harness = await picker(); let tree = harness.render();
  elements(tree).find((node) => node.type === uptimeUi.UptimeCheckbox)!.props.onChange({ target: { checked: true } });
  assert.deepEqual(Array.from(harness.props().value), ["person0@example.com"]);
  tree = harness.render(); byLabel(tree, "Next members").props.onClick(); await settle();
  tree = harness.render();
  assert.equal(elements(tree).filter((node) => node.type === uptimeUi.UptimeCheckbox).length, 20);
  assert.match(renderToStaticMarkup(tree), /Person 20/); assert.doesNotMatch(renderToStaticMarkup(tree), /Person 0</);
  assert.equal(harness.nextCalls(), 1);
  assert.equal(byLabel(tree, "Remove person0@example.com").props.type, "button");
  elements(tree).find((node) => node.type === uptimeUi.UptimeCheckbox)!.props.onChange({ target: { checked: true } });
  assert.deepEqual(Array.from(harness.props().value), ["person0@example.com", "person20@example.com"]);
  tree = harness.render(); byLabel(tree, "Previous members").props.onClick();
  tree = harness.render();
  assert.equal(elements(tree).find((node) => node.type === uptimeUi.UptimeCheckbox)!.props.checked, true);
  assert.equal(harness.nextCalls(), 1, "previous pages are cached without another request");
  elements(tree).find((node) => node.props.id === "recipients-search")!.props.onChange({ target: { value: "Ada" } });
  tree = harness.render(); assert.equal(elements(tree).filter((node) => node.type === uptimeUi.UptimeCheckbox).length, 0, "old search results must not masquerade as new matches");
  harness.flushTimers(); tree = harness.render();
  assert.deepEqual(normalize(harness.options().queryKey), ["uptime", "outray-tunnel", "members", "Ada", null]);
  assert.deepEqual(Array.from(harness.props().value), ["person0@example.com", "person20@example.com"]);
  byLabel(tree, "Remove person20@example.com").props.onClick(); assert.deepEqual(Array.from(harness.props().value), ["person0@example.com"]);
});

test("search is debounced 250ms, resets pagination, and cancels superseded timers", async () => {
  const harness = await picker(ready([page(), page(members(20, 20), null)]));
  let tree = harness.render(); byLabel(tree, "Next members").props.onClick(); tree = harness.render();
  assert.match(renderToStaticMarkup(tree), /Page 2/);
  const search = () => elements(harness.render()).find((node) => node.props.id === "recipients-search")!;
  search().props.onChange({ target: { value: "  Ad " } }); harness.render();
  search().props.onChange({ target: { value: "  Ada " } }); harness.render();
  assert.equal(harness.options().queryKey[3], "");
  harness.flushTimers(); tree = harness.render();
  assert.equal(harness.options().queryKey[3], "Ada"); assert.match(renderToStaticMarkup(tree), /Page 1/);
  assert.ok(harness.timerDelays.every((delay) => delay === 250));
  search().props.onChange({ target: { value: "" } }); harness.render(); harness.flushTimers(); tree = harness.render();
  assert.equal(harness.options().queryKey[3], ""); assert.equal(harness.options().queryKey[4], null);
  assert.match(renderToStaticMarkup(tree), /Page 1/); assert.match(renderToStaticMarkup(tree), /Person 0</);
});

test("loading, empty history, no matches, and failures remain distinct and retryable", async () => {
  const harness = await picker(); harness.render();
  harness.setQuery({ data: undefined, isPending: true }); assert.match(renderToStaticMarkup(harness.render()), /Loading team members/);
  harness.setQuery({ data: page([], null), isPending: false }); assert.match(renderToStaticMarkup(harness.render()), /No team members available/);
  const search = elements(harness.render()).find((node) => node.props.id === "recipients-search")!;
  search.props.onChange({ target: { value: "missing" } }); harness.render(); harness.flushTimers(); harness.render();
  harness.setQuery({ data: page([], null), isPending: false }); assert.match(renderToStaticMarkup(harness.render()), /No members match your search/);
  harness.setQuery({ error: new Error("Members unavailable") });
  const tree = harness.render(); const html = renderToStaticMarkup(tree);
  assert.match(html, /role="alert"/); assert.match(html, /Members unavailable/); assert.doesNotMatch(html, /No members match/);
  elements(tree).find((node) => node.type === "button" && node.props.children === "Try again")!.props.onClick(); await settle();
  assert.equal(harness.retryCalls(), 1);
});

test("pagination guards double clicks, and failures preserve selections with a cached route back", async () => {
  const harness = await picker(); harness.setProps({ value: ["external@example.com"] });
  let tree = harness.render();
  byLabel(tree, "Next members").props.onClick(); byLabel(tree, "Next members").props.onClick();
  tree = harness.render(); assert.equal(harness.nextCalls(), 1);
  harness.setQuery({ data: undefined, error: new Error("Next page failed") });
  tree = harness.render(); assert.match(renderToStaticMarkup(tree), /Next page failed/);
  assert.deepEqual(Array.from(harness.props().value), ["external@example.com"]);
  byLabel(tree, "Previous members").props.onClick(); tree = harness.render();
  assert.match(renderToStaticMarkup(tree), /Person 0/); assert.equal(harness.nextCalls(), 1);
  let reject!: (error: Error) => void;
  harness.setRetry(() => new Promise((_resolve, fail) => { reject = fail; }));
  harness.setQuery({ error: new Error("Refresh failed") }); tree = harness.render();
  const retry = elements(tree).find((node) => node.type === "button" && node.props.children === "Try again")!;
  retry.props.onClick(); retry.props.onClick(); assert.equal(harness.retryCalls(), 1);
  reject(new Error("Retry failed")); await settle();
  assert.match(renderToStaticMarkup(harness.render()), /Refresh failed/);
  harness.setRetry(async () => ({})); retry.props.onClick(); await settle(); assert.equal(harness.retryCalls(), 2);
});

test("small teams do not show unnecessary pagination and background refresh keeps usable choices", async () => {
  const small = await picker(ready([page(members(1), null)])); let tree = small.render();
  assert.equal(byLabel(tree, "Previous members"), undefined); assert.equal(byLabel(tree, "Next members"), undefined);
  small.setQuery({ isFetching: true }); tree = small.render();
  assert.equal(elements(tree).find((node) => node.type === uptimeUi.UptimeCheckbox)!.props.disabled, false);
  assert.match(renderToStaticMarkup(tree), /Person 0/); assert.doesNotMatch(renderToStaticMarkup(tree), /Loading team members/);
});

test("selection cap never discards existing recipients and disables only new selections", async () => {
  const selected = members(25).map((member) => member.email);
  assert.equal(recipientData.toggleUptimeRecipient(selected, "new@example.com", true), selected);
  assert.equal(recipientData.toggleUptimeRecipient(selected, selected[0], true), selected);
  assert.equal(recipientData.toggleUptimeRecipient(selected, selected[0], false).length, 24);
  const harness = await picker(ready([page(members(20, 20))])); harness.setProps({ value: selected });
  const rows = elements(harness.render()).filter((node) => node.type === uptimeUi.UptimeCheckbox);
  assert.equal(rows[0].props.disabled, false); assert.equal(rows[5].props.disabled, true);
  assert.equal(rows[0].props.checked, true); assert.equal(rows[5].props.checked, false);
  harness.setProps({ disabled: true });
  assert.equal(harness.render().props.disabled, true);
  assert.ok(elements(harness.render()).filter((node) => node.type === uptimeUi.UptimeCheckbox).every((node) => node.props.disabled));
});
