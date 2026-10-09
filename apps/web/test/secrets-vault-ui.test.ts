import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { VaultContent, type VaultContentProps } from "../src/components/secrets/vault-content";
import * as overviewData from "../src/components/secrets/overview-data";
import * as utils from "../src/components/secrets/utils";
import type { SecretEnvironment, SecretProject } from "../src/lib/secrets-client";

Object.assign(globalThis, { React });

function environment(index: number, overrides: Partial<SecretEnvironment> = {}): SecretEnvironment {
  return {
    id: `environment-${index}`, slug: `environment-${index}`, name: `Environment ${index}`, description: `Configuration ${index}`,
    color: "violet", secretCount: index, revision: index, isProduction: false,
    createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-05T12:00:00Z", ...overrides,
  };
}
const environments = Array.from({ length: 8 }, (_, index) => environment(index));
const project: SecretProject = {
  id: "vault-api", slug: "payments-api", name: "Payments API", description: "Application credentials",
  environments, environmentCount: environments.length, secretCount: 1234,
  createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-04T12:00:00Z",
};
const defaults: VaultContentProps = {
  orgSlug: "acme", project, loading: false, refreshing: false, error: null, search: "",
  onSearchChange: () => {}, onRetry: () => {}, onCreateEnvironment: () => {}, onEditVault: () => {}, onDeleteVault: () => {},
  onEditEnvironment: () => {}, onDeleteEnvironment: () => {},
};

function render(overrides: Partial<VaultContentProps> = {}) {
  const props = { ...defaults, ...overrides };
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([org.addChildren([rest])]),
    history: createMemoryHistory({ initialEntries: [`/${encodeURIComponent(props.orgSlug)}/secrets/vaults/${encodeURIComponent(props.project?.slug ?? "missing")}`] }),
  });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(VaultContent, props) }));
}

const rows = (html: string) => [...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(([row]) => row);
const links = (html: string) => [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(([link]) => link);
const href = (link: string) => link.match(/href="([^"]+)"/)?.[1];
const environmentLinks = (html: string) => links(html).filter((link) => /\/secrets\/vaults\/[^/]+\/environments\//.test(href(link) ?? ""));
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
const textContent = (html: string) => html.replace(/<[^>]*>/g, "");
const summary = (html: string) => html.match(/<dl\b[^>]*aria-label="Vault summary"[^>]*>[\s\S]*?<\/dl>/)?.[0] ?? "";
const identity = (row: string) => row.match(/<span\b[^>]*class="flex size-8[^>]*>/)?.[0] ?? "";

test("add environment launchers are medium while row menu affordances stay compact", () => {
  const emptyProject = { ...project, environments: [], environmentCount: 0, secretCount: 0 };
  for (const html of [render(), render({ project: emptyProject })]) {
    const launchers = buttons(html).filter((button) => button.includes("Add environment"));
    assert.ok(launchers.length > 0);
    for (const button of launchers) {
      assert.match(button, /class="button (?:primary|secondary) md(?:\s|")/);
      assert.match(button, /aria-haspopup="dialog"/);
    }
  }
  for (const row of rows(render())) {
    const action = buttons(row).find((button) => button.includes('aria-label="Actions for')) ?? "";
    assert.match(action, /class="button ghost sm /);
  }
});

test("the vault shows its complete environment inventory and inline persisted metadata rather than summary cards or tiles", () => {
  const html = render();
  assert.match(html, /<h1[^>]*>Payments API<\/h1>/);
  assert.match(html, /Application credentials/);
  assert.equal(rows(html).length, environments.length);
  assert.deepEqual(environmentLinks(html).map(href), environments.map(({ slug }) => `/acme/secrets/vaults/payments-api/environments/${slug}`));
  assert.match(summary(html), /<dt[^>]*>[\s\S]*?Environments<\/dt><dd[^>]*>8<\/dd>/);
  assert.match(summary(html), /<dt[^>]*>[\s\S]*?Stored secrets<\/dt><dd[^>]*>1,234<\/dd>/);
  assert.match(summary(html), /dateTime="2026-10-05T12:00:00Z"/);
  assert.match(html, /@container\/vault-environments/);
  assert.match(html, /@\[720px\]\/vault-environments:grid/);
  assert.doesNotMatch(html, /overflow-hidden/, "the loaded list surface must not clip its inline action menus");
  assert.doesNotMatch(html, /number-flow-react|Secrets summary|recharts-|<canvas\b|xl:grid-cols-3|Showing 6 of/);
  assert.match(textContent(rows(html)[0]), /0 secrets.*Revision r0/);
  assert.match(textContent(rows(html)[1]), /1 secret.*Revision r1/);
});

test("encoded direct environment links and the scoped catalog backlink remain native and separate from actions", () => {
  const orgSlug = "team /?β"; const projectSlug = "api /?#β"; const environmentSlug = "live /?#β";
  const target = environment(0, { slug: environmentSlug, name: "Live" });
  const html = render({ orgSlug, project: { ...project, slug: projectSlug, environments: [target], environmentCount: 1 } });
  assert.equal(href(links(html)[0]), `/${encodeURIComponent(orgSlug)}/secrets/vaults`);
  assert.equal(href(environmentLinks(html)[0]), `/${encodeURIComponent(orgSlug)}/secrets/vaults/${encodeURIComponent(projectSlug)}/environments/${encodeURIComponent(environmentSlug)}`);
  const row = rows(html)[0]; const primary = environmentLinks(row)[0];
  assert.match(primary, /aria-label="Open Live environment"/);
  assert.match(primary, /after:absolute after:inset-0 after:z-\[1\]/);
  assert.match(primary, /focus-visible:after:outline-2/);
  assert.doesNotMatch(primary.match(/<a\b[^>]*>/)?.[0] ?? "", /truncate|overflow-hidden/);
  assert.doesNotMatch(primary, /<button\b|<input\b|role="button"/);
  assert.match(row, /relative z-\[2\]/);
  const menu = buttons(row).find((button) => button.includes('aria-label="Actions for Live"')) ?? "";
  assert.match(menu, /type="button"/); assert.match(menu, /aria-expanded="false"/);
  assert.doesNotMatch(menu, /disabled/);
  let depth = 0;
  for (const [tag] of html.matchAll(/<\/?a\b[^>]*>/g)) {
    depth += tag.startsWith("</") ? -1 : 1;
    assert.ok(depth >= 0 && depth <= 1, "action or row links must never be nested");
  }
  assert.equal(depth, 0);
  assert.doesNotMatch(html, /href="\/acme\//);
});

test("production badges and accessible names use the persisted flag, never production-like slugs or names", () => {
  const protectedEnvironment = environment(0, { name: "Live", slug: "live", isProduction: true, color: "blue" });
  const namedProduction = environment(1, { name: "Production", slug: "production", isProduction: false, color: "rose" });
  const html = render({ project: { ...project, environments: [protectedEnvironment, namedProduction] } });
  const [protectedRow, unprotectedRow] = rows(html);
  assert.match(protectedRow, /aria-label="Open Live environment \(production\)"/);
  assert.match(protectedRow, /lucide-lock-keyhole/);
  assert.match(protectedRow, /<span[^>]*text-amber[^>]*>[\s\S]*?Production<\/span>/);
  assert.match(identity(protectedRow), /text-blue-300/);
  assert.match(unprotectedRow, /aria-label="Open Production environment"/);
  assert.doesNotMatch(unprotectedRow, /\(production\)|lucide-lock-keyhole|text-amber/);
  assert.match(identity(unprotectedRow), /text-rose-300/);
});

test("stored supported colors use an explicit palette and unknown or prototype names receive a neutral identity", () => {
  for (const color of ["emerald", "amber", "rose", "violet", "blue"] as const) {
    const html = render({ project: { ...project, environments: [environment(0, { color })] } });
    assert.ok(identity(rows(html)[0]).includes(`text-${color}-300`));
  }
  for (const color of [undefined, null, "unknown-color", "__proto__", "constructor", "toString", "emerald bg-red-500", "url(private-value)"]) {
    const html = render({ project: { ...project, environments: [environment(0, { color })] } });
    assert.match(identity(rows(html)[0]), /text-zinc-500/);
    assert.doesNotMatch(identity(rows(html)[0]), /text-(emerald|amber|rose|violet|blue)-|bg-red|url\(|\[object Object\]|function /);
    assert.doesNotMatch(html, /unknown-color|__proto__|constructor|toString|private-value/);
  }
});

test("search uses environment names, slugs, and descriptions without truncating the inventory or mutating it", () => {
  const searchable = environment(7, { name: "Canary West", slug: "preview-west", description: "Reconciliation trials" });
  const catalog = [...environments.slice(0, 7), searchable];
  const unchanged = JSON.stringify(catalog);
  catalog.forEach(Object.freeze); Object.freeze(catalog);
  const target = { ...project, environments: catalog };
  for (const search of [" canary west ", "PREVIEW-WEST", "reconciliation"]) {
    const html = render({ project: target, search });
    assert.equal(rows(html).length, 1);
    assert.equal(href(environmentLinks(html)[0]), "/acme/secrets/vaults/payments-api/environments/preview-west");
    assert.match(textContent(html), /1 of 8 environments/);
    assert.match(html, /type="search"/);
  }
  assert.equal(rows(render({ project: target, search: "   " })).length, 8);
  assert.equal(JSON.stringify(catalog), unchanged);
});

test("native search and header actions remain labeled and keyboard-reachable, with motion-safe row focus", () => {
  const html = render({ search: "  Environment  " });
  const label = html.match(/<label for="([^"]+)">Search environments<\/label>/)?.[1];
  assert.ok(label);
  const search = html.match(/<input\b[^>]*type="search"[^>]*>/)?.[0] ?? "";
  assert.ok(search.includes(`id="${label}"`));
  assert.match(search, /value=" {2}Environment {2}"/);
  assert.match(search, /maxLength="200"/); assert.match(search, /autoComplete="off"/); assert.match(search, /spellCheck="false"/);
  assert.match(html, /aria-label="Clear search"/);
  const create = buttons(html).find((button) => textContent(button).includes("Add environment")) ?? "";
  assert.match(create, /aria-haspopup="dialog"/); assert.match(create, /tabindex="0"/); assert.doesNotMatch(create, /disabled/);
  assert.match(html, /aria-label="Vault actions"/);
  assert.match(links(html)[0], /focus-visible:outline-2/);
  for (const row of rows(html)) {
    assert.match(row, /motion-reduce:transition-none/);
    assert.match(row, /focus-within:bg/);
    assert.match(environmentLinks(row)[0], /focus-visible:after:outline-2/);
  }
});

test("initial skeleton matches the list layout but exposes no invented metadata or writable vault actions", () => {
  const html = render({ project: null, loading: true, refreshing: true });
  assert.match(html, /aria-label="Loading vault" aria-busy="true"/);
  assert.match(html, /motion-reduce:animate-none/);
  assert.match(html, /@container\/vault-environments/);
  assert.equal((html.match(/min-h-\[88px\]/g) ?? []).length, 3);
  assert.match(html, /h-9 max-w-sm/);
  assert.equal(environmentLinks(html).length, 0);
  assert.doesNotMatch(html, /Vault summary|Stored secrets|Revision r0|type="search"|Vault unavailable|Add your first environment|No matching environments|Vault actions|Add environment/);
  assert.equal(links(html).length, 1, "the catalog backlink remains available while loading");
});

test("unavailable vaults, truly empty inventories, and search misses have separate recovery controls", () => {
  const unavailable = render({ project: null, error: "Vault no longer exists" });
  assert.match(unavailable, /role="alert"/); assert.match(unavailable, /Vault unavailable/); assert.match(unavailable, /Vault no longer exists/); assert.match(unavailable, /Try again/);
  assert.doesNotMatch(unavailable, /Vault summary|Add your first environment|No matching environments|Vault actions|type="search"/);
  const empty = render({ project: { ...project, environments: [], environmentCount: 0, secretCount: 0 }, search: "not-empty-metadata" });
  assert.match(empty, /Add your first environment/);
  assert.match(empty, /Vault summary/);
  assert.equal(buttons(empty).filter((button) => textContent(button).includes("Add environment")).length, 2);
  assert.doesNotMatch(empty, /No matching environments|Vault unavailable|type="search"|Try again/);
  const unmatched = render({ search: "unmatched-environment" });
  assert.match(unmatched, /No matching environments/); assert.match(unmatched, /Clear search/);
  assert.match(textContent(unmatched), /0 of 8 environments/);
  assert.match(unmatched, /type="search"[^>]*value="unmatched-environment"/);
  assert.match(unmatched, /Vault summary/);
  assert.equal(environmentLinks(unmatched).length, 0);
  assert.doesNotMatch(unmatched, /Add your first environment|Vault unavailable|Try again/);
});

test("refresh loading or errors retain the vault, filters, available actions, and metadata rather than replacing them", () => {
  const updating = render({ loading: true, refreshing: true, search: "Environment", error: null });
  assert.equal(rows(updating).length, 8);
  assert.match(updating, /role="status" aria-live="polite"/); assert.match(textContent(updating), /Updating/);
  assert.match(updating, /motion-reduce:animate-none/); assert.match(updating, /Vault summary/);
  assert.doesNotMatch(updating, /Loading vault|Vault unavailable/);
  const failed = render({ error: "Private internal refresh error", search: "Environment 7" });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Showing the last available metadata/); assert.match(failed, /Retry/);
  assert.equal(rows(failed).length, 1); assert.match(failed, /value="Environment 7"/);
  assert.match(failed, /Vault actions/); assert.match(failed, /Add environment/); assert.match(failed, /Vault summary/);
  assert.doesNotMatch(failed, /Private internal refresh error|Vault unavailable|Loading vault/);
});

test("metadata dates reject invalid values, and unexpected plaintext or private transport fields never render", () => {
  const privateEnvironment = { ...environment(0, { updatedAt: "invalid" }), value: "private-environment-value", ciphertext: "private-environment-ciphertext", token: "private-environment-token" };
  const privateProject = { ...project, updatedAt: "invalid", environments: [privateEnvironment], value: "private-plaintext", ciphertext: "private-ciphertext", token: "private-token", secrets: [{ key: "PRIVATE_KEY", value: "private-secret-value" }] };
  const html = render({ project: privateProject });
  assert.match(textContent(html), /Payments API/); assert.match(textContent(html), /Environment 0/);
  assert.match(textContent(summary(html)), /Last changedUnknown/);
  assert.match(textContent(rows(html)[0]), /Updated Unknown/);
  assert.doesNotMatch(html, /<time\b|dateTime="invalid"|private-|PRIVATE_KEY|Healthy|All secure|Encrypted at rest/);
});

test("actual content actions preserve environment identity and only invoke their requested create/edit/delete/retry/search adapters", async () => {
  const source = await readFile(new URL("../src/components/secrets/vault-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const Button = () => null; const SearchField = () => null; const ActionMenu = () => null; const Placeholder = () => null;
  const external = new Set([Button, SearchField, ActionMenu, Placeholder]);
  const module = { exports: {} as any };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return { useMemo: (callback: () => unknown) => callback() };
      if (specifier === "@tanstack/react-router") return { Link: Placeholder };
      if (specifier === "lucide-react") return { ArrowLeft: Placeholder, ArrowUpRight: Placeholder, Clock3: Placeholder, FolderKey: Placeholder, KeyRound: Placeholder, Layers: Placeholder, LockKeyhole: Placeholder, Plus: Placeholder, RefreshCw: Placeholder, Search: Placeholder };
      if (specifier.startsWith("@outray/icons/")) return Placeholder;
      if (specifier === "../arc/button/button") return { Button };
      if (specifier === "../arc/search-field/search-field") return { SearchField };
      if (specifier === "./secrets-ui") return { ActionMenu };
      if (specifier === "./overview-data") return overviewData;
      if (specifier === "./utils") return utils;
      if (specifier.endsWith(".css")) return {};
      throw new Error(`Unexpected individual vault dependency: ${specifier}`);
    },
  });
  let creates = 0; let retries = 0; let vaultEdits = 0; let vaultDeletes = 0;
  const searches: string[] = []; const edits: SecretEnvironment[] = []; const deletes: SecretEnvironment[] = [];
  const props: VaultContentProps = {
    ...defaults, onCreateEnvironment: () => { creates++; }, onRetry: () => { retries++; },
    onEditVault: () => { vaultEdits++; }, onDeleteVault: () => { vaultDeletes++; },
    onSearchChange: (value) => searches.push(value), onEditEnvironment: (value) => edits.push(value), onDeleteEnvironment: (value) => deletes.push(value),
  };
  function collect(node: React.ReactNode): React.ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(collect);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>;
    if (typeof element.type === "function" && !external.has(element.type as () => null)) return [element, ...collect((element.type as (props: any) => React.ReactNode)(element.props))];
    return [element, ...collect(element.props.children)];
  }
  const elements = collect(module.exports.VaultContent(props));
  const search = elements.find((element) => element.type === SearchField);
  assert.ok(search); assert.equal(search.props.onValueChange, props.onSearchChange);
  search.props.onValueChange("  user draft  ");
  const create = elements.find((element) => element.type === Button && React.Children.toArray(element.props.children).includes("Add environment"));
  assert.ok(create); create.props.onClick(); assert.equal(creates, 1);
  const vaultMenu = elements.find((element) => element.type === ActionMenu && element.props.label === "Vault actions");
  assert.ok(vaultMenu); assert.equal(vaultMenu.props.compact, true);
  assert.equal(vaultMenu.props.items[0].onSelect, props.onEditVault); assert.equal(vaultMenu.props.items[1].onSelect, props.onDeleteVault);
  vaultMenu.props.items[0].onSelect(); vaultMenu.props.items[1].onSelect();
  assert.equal(vaultEdits, 1); assert.equal(vaultDeletes, 1); assert.equal(vaultMenu.props.items[1].danger, true);
  for (const expected of environments) {
    const menu = elements.find((element) => element.type === ActionMenu && element.props.label === `Actions for ${expected.name}`);
    assert.ok(menu); assert.equal(menu.props.compact, true);
    assert.equal(menu.props.items[1].danger, true);
    menu.props.items[0].onSelect(); menu.props.items[1].onSelect();
    assert.equal(edits.at(-1), expected); assert.equal(deletes.at(-1), expected);
  }
  assert.equal(edits.length, environments.length); assert.equal(deletes.length, environments.length);
  for (const next of [{ project: null, error: "Initial failure" }, { error: "Refresh failure" }]) {
    const retry = collect(module.exports.VaultContent({ ...props, ...next })).find((element) => element.type === Button && element.props.onClick === props.onRetry);
    assert.ok(retry); retry.props.onClick();
  }
  assert.equal(retries, 2);
  const noResults = collect(module.exports.VaultContent({ ...props, search: "unmatched" }));
  const clear = noResults.find((element) => element.type === Button && React.Children.toArray(element.props.children).includes("Clear search"));
  assert.ok(clear); clear.props.onClick(); assert.deepEqual(searches, ["  user draft  ", ""]);
});
