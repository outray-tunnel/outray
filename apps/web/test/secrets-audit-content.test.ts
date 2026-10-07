import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { SecretsAuditContent } from "../src/components/secrets/audit-content";
import * as auditData from "../src/components/secrets/audit-data";
import * as utils from "../src/components/secrets/utils";
import type { SecretAuditEvent } from "../src/lib/secrets-client";

Object.assign(globalThis, { React });
type Props = React.ComponentProps<typeof SecretsAuditContent>;

function event(id: string, overrides: Partial<SecretAuditEvent> = {}): SecretAuditEvent {
  return {
    id, action: "secret.revealed", resourceType: "secret", targetType: "secret", resourceName: "DATABASE_URL",
    actorType: "user", actorName: "Ada Example", actorEmail: "ada@example.invalid", actorCredential: "session",
    projectId: "vault-api", projectName: "API", projectSlug: "api", environmentId: "env-production", environmentName: "Production", environmentSlug: "production",
    createdAt: "2026-10-07T08:00:00Z", result: "success", metadata: { version: 2, current: true }, ...overrides,
  };
}

const inventory = [
  event("secret"),
  event("vault", { action: "project.created", targetType: "project", resourceType: "project", resourceName: "Payments", projectName: "Payments", projectId: "vault-payments", projectSlug: "payments" }),
  event("bulk", { action: "secrets.bulk_moved", targetType: "bulk", resourceName: null, actorType: "machine", actorName: "Deployment token", actorEmail: null, actorCredential: "machine", metadata: { moved: 3, skipped: 1 } }),
  event("share", { action: "share.created", targetType: "share", resourceName: null, metadata: { count: 3, maxViews: 10 } }),
  event("token", { action: "machine_token.created", targetType: "machine_token", resourceName: "Production deployer" }),
  event("system", { action: "organization_key.rewrapped", targetType: "organization_key", resourceName: "v3", actorType: "system", actorName: null, actorEmail: null, actorCredential: "system" }),
];

function render(overrides: Partial<Props> = {}) {
  const props: Props = {
    events: inventory, loading: false, refreshing: false, error: null,
    hasMore: false, loadingMore: false, loadMoreError: null,
    search: "", resource: "all", actor: "all", vault: "all", selectedId: null,
    onSearchChange: () => {}, onResourceChange: () => {}, onActorChange: () => {}, onVaultChange: () => {},
    onClearFilters: () => {}, onChooseVaults: () => {}, onRetry: () => {}, onLoadMore: () => {}, onOpenEvent: () => {},
    ...overrides,
  };
  return renderToStaticMarkup(React.createElement(SecretsAuditContent, props));
}
const rows = (html: string) => [...html.matchAll(/<(?:button|article|li|div)\b[^>]*data-audit-event="([^"]+)"[^>]*>/g)].map(([, id]) => id);
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
const text = (html: string) => html.replace(/<[^>]*>/g, "");
const olderButton = (html: string) => buttons(html).find((button) => /Load (?:more|older)|Older activity/i.test(text(button)));

test("empty audit history explains what is recorded without pretending no access has ever occurred", () => {
  const html = render({ events: [] });
  assert.match(text(html), /No (?:activity|audit|events)|Activity will appear|Nothing recorded/i);
  assert.match(text(html), /secret|vault|activity/i);
  assert.match(text(html), /record|access|reveal|change/i);
  assert.equal(rows(html).length, 0);
  assert.doesNotMatch(html, /No matching|Could not load|Loading audit|Never accessed|No one has accessed/);
});

test("initial audit loading uses an accessible layout skeleton and avoids empty-history text", () => {
  const html = render({ events: undefined, loading: true });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Loading (?:audit|activity)/i);
  assert.match(html, /motion-reduce:animate-none/);
  assert.equal(rows(html).length, 0);
  assert.doesNotMatch(html, /DATABASE_URL|Deployment token|No matching|Nothing recorded|No activity yet/);
});

test("failed initial requests show a recoverable error rather than empty history", () => {
  const html = render({ events: undefined, error: "Audit request unavailable" });
  assert.match(html, /role="alert"/); assert.match(html, /Audit request unavailable/);
  assert.match(html, /Retry|Try again/); assert.equal(rows(html).length, 0);
  assert.doesNotMatch(html, /No matching|Nothing recorded|DATABASE_URL|Loading audit/);
});

test("audit rows have compact metadata, correct true resource types and readable human/machine/system actors", () => {
  const html = render(); const content = text(html);
  assert.deepEqual(rows(html), inventory.map(({ id }) => id));
  for (const expected of ["DATABASE_URL", "Vault created", "Payments", "Share", "Machine token", "Deployment token", "System"]) assert.ok(content.includes(expected), expected);
  assert.match(content, /Secret batch/i); assert.match(content, /API.*Production/);
  assert.match(html, /<time\b[^>]*dateTime="2026-10-07T08:00:00Z"/);
  for (const [select] of html.matchAll(/<select\b[^>]*>/g)) {
    assert.match(select, /aria-hidden="true"/); assert.match(select, /tabindex="-1"/);
  }
  assert.doesNotMatch(html, /<input\b[^>]*type="checkbox"/);
  assert.doesNotMatch(content, /Project created|all .*activity.*complete|entire audit history/i);
});

test("every event opens detail through a real keyboard-capable dialog button", () => {
  const html = render(); const ids = rows(html);
  assert.equal(ids.length, inventory.length);
  for (const id of ids) {
    const position = html.indexOf(`data-audit-event="${id}"`);
    const start = html.lastIndexOf("<", position);
    const tag = html.slice(start, html.indexOf(">", position) + 1);
    if (tag.startsWith("<button")) {
      assert.match(tag, /type="button"/); assert.match(tag, /aria-haspopup="dialog"/);
      assert.match(tag, /aria-label="[^"]+"/);
    } else {
      const next = html.indexOf("data-audit-event=", position + 1);
      const chunk = html.slice(start, next === -1 ? undefined : next);
      assert.match(chunk, /<button\b[^>]*type="button"[^>]*aria-haspopup="dialog"/);
    }
  }
});

test("custom Arc search and filters preserve entered values and filter actual loaded rows", () => {
  const html = render({ search: "  DATABASE  ", resource: "secret", actor: "user", vault: "vault-api" });
  assert.deepEqual(rows(html), ["secret"]);
  assert.match(html, /type="search"[^>]*value=" {2}DATABASE {2}"/);
  const inputId = html.match(/<input\b[^>]*id="([^"]+)"[^>]*type="search"/)?.[1];
  assert.ok(inputId); assert.ok(html.includes(`<label for="${inputId}">Search loaded audit events</label>`));
  assert.equal([...html.matchAll(/role="combobox"/g)].length, 3);
  for (const [select] of html.matchAll(/<select\b[^>]*>/g)) assert.match(select, /aria-hidden="true"/);
  assert.doesNotMatch(html, /Deployment token|Production deployer/);
});

test("filter misses keep older-page loading available and acknowledge loaded-activity scope", () => {
  const html = render({ search: "unloaded-record", hasMore: true });
  assert.match(text(html), /No matching|No .* match/i); assert.match(html, /Clear (?:filters|search)/);
  assert.equal(rows(html).length, 0); assert.ok(olderButton(html));
  assert.match(text(html), /loaded|older|load more/i);
  assert.doesNotMatch(text(html), /no events exist|no audit history|searched (?:all|the entire)/i);
});

test("background refresh retains rows and controls, while failed refresh offers inline retry", () => {
  const updating = render({ loading: true, refreshing: true, search: "  DATABASE  " });
  assert.deepEqual(rows(updating), ["secret"]); assert.match(updating, /value=" {2}DATABASE {2}"/);
  assert.match(text(updating), /Updating|Refreshing/i); assert.doesNotMatch(updating, /Loading audit|No activity yet/);
  const failed = render({ error: "Audit refresh unavailable", search: "DATABASE" });
  assert.deepEqual(rows(failed), ["secret"]); assert.match(failed, /role="alert"/);
  assert.match(text(failed), /could not refresh|refresh failed/i); assert.match(failed, /Retry|Try again/);
  assert.doesNotMatch(failed, /Loading audit|No activity yet/);
});

test("pagination loading and failures never hide existing audit activity", () => {
  const loading = render({ hasMore: true, loadingMore: true });
  assert.deepEqual(rows(loading), inventory.map(({ id }) => id));
  assert.match(loading, /disabled=""/); assert.match(text(loading), /Loading|older/i);
  const failed = render({ hasMore: true, loadMoreError: "Older audit events unavailable" });
  assert.deepEqual(rows(failed), inventory.map(({ id }) => id));
  assert.match(failed, /role="alert"/); assert.match(failed, /Older audit events unavailable/);
  assert.ok(olderButton(failed), "the retryable older-page action stays available");
});

test("unsupported fields and arbitrary metadata never appear, while intended labels are escaped", () => {
  const privateEvent = Object.assign(event("private", {
    resourceName: '<script>alert("private-name")</script>', actorName: "<Actor>", projectName: "<Vault>",
    metadata: {
      value: "never-render-this-value", token: "never-render-this-token", oldValue: "never-render-this-old-value",
      ciphertext: "never-render-this-ciphertext", iv: "never-render-this-iv", shareKey: "never-render-this-share-key",
      url: "https://example.invalid/#never-render-this-fragment", arbitrary: { nested: "never-render-this-nested-value" },
    },
  }), { value: "never-render-this-top-level-value", token: "never-render-this-top-level-token" });
  const html = render({ events: [privateEvent] });
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;Actor&gt;/); assert.match(html, /&lt;Vault&gt;/);
  assert.doesNotMatch(html, /<script\b|never-render-this|example\.invalid\/#/);
});

test("unknown or missing audit results never gain a fabricated Successful outcome", () => {
  for (const result of [null, undefined]) {
    const html = render({ events: [event("legacy", { result })] });
    assert.deepEqual(rows(html), ["legacy"]);
    assert.doesNotMatch(text(html), /Successful|Succeeded|Success/);
  }
});

test("selection remains attached to its ID without changing event order or hiding content", () => {
  const html = render({ selectedId: "share" });
  assert.deepEqual(rows(html), inventory.map(({ id }) => id));
  assert.match(html, /data-audit-event="share"/);
});

test("audit timeline is grouped by date in native expanded disclosures with labelled ordered lists", () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10);
  const html = render({ events: [
    event("today-a", { createdAt: today.toISOString() }), event("today-b", { createdAt: today.toISOString() }),
    event("yesterday", { createdAt: yesterday.toISOString() }), event("undated", { createdAt: "not-recorded" }),
  ] });
  const disclosures = [...html.matchAll(/<details\b[^>]*data-audit-day="([^"]+)"[^>]*>/g)];
  assert.equal(disclosures.length, 3, "each local date receives one day group");
  for (const [tag] of disclosures) assert.match(tag, /\bopen=""/);
  const summaries = [...html.matchAll(/<summary\b[^>]*>[\s\S]*?<\/summary>/g)].map(([summary]) => summary);
  assert.equal(summaries.length, 3);
  for (const summary of summaries) {
    assert.match(summary, /aria-expanded="true"/);
    const listId = summary.match(/aria-controls="([^"]+)"/)?.[1];
    assert.ok(listId, "each summary identifies the events it discloses");
    assert.match(html, new RegExp(`<ol\\b[^>]*id="${listId}"[^>]*aria-label="[^"]+"|<ol\\b[^>]*aria-label="[^"]+"[^>]*id="${listId}"`));
  }
  assert.match(text(html), /Today/); assert.match(text(html), /Yesterday/); assert.match(text(html), /Not recorded/);
  assert.match(text(html), /Collapse all/);
  assert.deepEqual(rows(html), ["today-a", "today-b", "yesterday", "undated"]);
});

test("timeline grouping follows filtered events rather than leaving empty calendar sections", () => {
  const today = new Date();
  const earlier = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 10);
  const html = render({ search: "only-one", events: [
    event("selected", { resourceName: "only-one", createdAt: today.toISOString() }),
    event("filtered-out", { resourceName: "not-in-filter", createdAt: earlier.toISOString() }),
  ] });
  assert.deepEqual(rows(html), ["selected"]);
  assert.equal([...html.matchAll(/data-audit-day="/g)].length, 1);
  assert.match(text(html), /Today/); assert.doesNotMatch(text(html), /Yesterday/);
});

test("timeline collapse controls preserve prior day choices during refresh, expand new days and reset on filter actions", async () => {
  const source = await readFile(new URL("../src/components/secrets/audit-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const Button = () => null; const Select = () => null; const SearchField = () => null; const Placeholder = () => null;
  const values: any[] = []; let index = 0;
  const hooks = {
    useMemo: (callback: () => unknown) => callback(),
    useState: (initial: any) => {
      const slot = index++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
      return [values[slot], (next: any) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
    },
  };
  const module = { exports: {} as any };
  runInNewContext(compiled, { React, Set, module, exports: module.exports, require: (specifier: string) => {
    if (specifier === "react") return hooks;
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Placeholder });
    if (specifier === "../arc/button/button") return { Button };
    if (specifier === "../arc/search-field/search-field") return { SearchField };
    if (specifier === "../arc/select/select") return { Select };
    if (specifier === "./audit-data") return auditData;
    if (specifier === "./utils") return utils;
    if (specifier.endsWith(".css")) return {};
    throw new Error(`Unexpected timeline dependency: ${specifier}`);
  } });
  const now = new Date();
  const today = event("today", { createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10).toISOString() });
  const yesterday = event("yesterday", { createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10).toISOString() });
  const older = event("older", { createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 10).toISOString() });
  const changes: Array<[string, string]> = [];
  let props: Props = {
    events: [today, yesterday], hasMore: true, loadingMore: false, search: "", resource: "all", actor: "all", vault: "all",
    onSearchChange: (value) => changes.push(["search", value]), onResourceChange: (value) => changes.push(["resource", value]),
    onActorChange: (value) => changes.push(["actor", value]), onVaultChange: (value) => changes.push(["vault", value]),
    onClearFilters: () => changes.push(["clear", ""]), onChooseVaults: () => {}, onRetry: () => {}, onLoadMore: () => {}, onOpenEvent: () => {},
  };
  function collect(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(collect); if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>; return [element, ...collect(element.props.children)];
  }
  function state() {
    index = 0; const elements = collect(module.exports.SecretsAuditContent(props));
    const days = elements.filter((element) => element.props.day && Array.isArray(element.props.day.events));
    const toggle = elements.find((element) => element.type === Button && /^(?:Expand|Collapse) all$/.test(String(element.props.children)));
    assert.ok(toggle); return { days, toggle, elements };
  }
  let current = state(); assert.deepEqual(current.days.map((day) => day.props.open), [true, true]);
  assert.equal(current.toggle.props.children, "Collapse all"); current.toggle.props.onClick();
  current = state(); assert.deepEqual(current.days.map((day) => day.props.open), [false, false]); assert.equal(current.toggle.props.children, "Expand all");
  props = { ...props, events: [{ ...today, resourceName: "Refreshed secret" }, yesterday, older], refreshing: true };
  current = state(); assert.deepEqual(current.days.map((day) => day.props.open), [false, false, true], "refresh retains existing collapsed days while exposing a newly loaded day");
  current.days[0].props.onToggle(true); current = state(); assert.equal(current.days[0].props.open, true);
  current.days[0].props.onToggle(false); current = state(); assert.equal(current.days[0].props.open, false);
  current.toggle.props.onClick(); current = state(); assert.deepEqual(current.days.map((day) => day.props.open), [false, false, false]);
  current.toggle.props.onClick(); current = state(); assert.deepEqual(current.days.map((day) => day.props.open), [true, true, true]);
  const controlActions = [
    () => state().elements.find((element) => element.type === SearchField)!.props.onValueChange("find"),
    () => state().elements.find((element) => element.type === Select && element.props.label === "Filter by resource")!.props.onValueChange("share"),
    () => state().elements.find((element) => element.type === Select && element.props.label === "Filter by actor")!.props.onValueChange("machine"),
    () => state().elements.find((element) => element.type === Select && element.props.label === "Filter by vault")!.props.onValueChange("vault-api"),
  ];
  for (const action of controlActions) {
    state().toggle.props.onClick(); assert.ok(state().days.every((day) => day.props.open === false));
    action(); assert.ok(state().days.every((day) => day.props.open === true), "filtering makes matching day groups visible again");
  }
  assert.deepEqual(changes, [["search", "find"], ["resource", "share"], ["actor", "machine"], ["vault", "vault-api"]]);
});
