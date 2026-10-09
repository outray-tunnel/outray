import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import ts from "typescript";
import { OrganizationAvatar, OrganizationSwitcherContent, type OrganizationSwitcherContentProps } from "../src/components/sidebar/organization-switcher-content";
import * as switcherState from "../src/components/sidebar/organization-switcher-state";
import type { SwitcherOrganization } from "../src/components/sidebar/organization-switcher-state";

Object.assign(globalThis, { React });

const organizations: SwitcherOrganization[] = [
  { id: "payments", name: "Payments Team", slug: "payments" },
  { id: "research", name: "Research Labs", slug: "research", logo: "/logos/research.png" },
  { id: "operations", name: "Operations", slug: "ops" },
];
const searchableOrganizations = [...organizations,
  { id: "alpha", name: "Alpha Team", slug: "alpha" },
  { id: "beta", name: "Beta Team", slug: "beta" },
  { id: "gamma", name: "Gamma Team", slug: "gamma" },
];
const defaults: OrganizationSwitcherContentProps = {
  organizations, orgSlug: "payments", pathname: "/payments/secrets/vaults/api/environments/live", query: "",
  onQueryChange: () => {}, onSelect: () => {}, onCreate: () => {}, onSearchKeyDown: () => {}, onListKeyDown: () => {},
  searchRef: { current: null }, listRef: { current: null },
};
function render(overrides: Partial<OrganizationSwitcherContentProps> = {}, suffix = "") {
  const props = { ...defaults, ...overrides };
  const root = createRootRoute(); const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: [`${props.pathname}${suffix}`] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(OrganizationSwitcherContent, props) }));
}
const links = (html: string) => [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(([link]) => link);
const options = (html: string) => links(html).filter((link) => link.includes('data-org-option=""'));
const href = (link: string) => link.match(/href="([^"]+)"/)?.[1];
const textContent = (html: string) => html.replace(/<[^>]*>/g, "");
function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>; return [element, ...elements(element.props.children)];
}

test("the complete organization inventory uses native labeled links with a single current organization and a separate create destination", () => {
  const inventory = Array.from({ length: 12 }, (_, index) => ({ id: `organization-${index}`, name: `Workspace ${index}`, slug: `workspace-${index}` }));
  const html = render({ organizations: inventory, orgSlug: "workspace-0", pathname: "/workspace-0/tunnel/tunnels" });
  assert.match(html, /<nav aria-label="Organizations"/);
  assert.equal(options(html).length, 12);
  assert.deepEqual(options(html).map(href), inventory.map(({ slug }) => `/${slug}/tunnel/tunnels`));
  assert.equal(options(html).filter((link) => /aria-current="(?:true|page)"/.test(link)).length, 1);
  assert.match(options(html)[0], /aria-label="Current organization"/);
  for (const [index, link] of options(html).entries()) {
    assert.match(link, new RegExp(`title="Workspace ${index}"`));
    assert.doesNotMatch(link, /class="slug"|title="workspace-\d+"/, "compact rows show the organization name without a second slug line");
    assert.doesNotMatch(link, /<a\b[\s\S]*?<a\b|<button\b|<input\b|role="menuitem"|tabindex="-1"/);
  }
  const create = links(html).find((link) => textContent(link).includes("Create organization"));
  assert.ok(create); assert.equal(href(create), "/onboarding");
  assert.equal(links(html).length, 13);
  assert.match(html, /<header class="heading"><span>Organizations<\/span><\/header>/);
  assert.doesNotMatch(html, /class="count"/);
  // The actual dropdown derives both values from the same router location.
  // Keeping the pathname under another organization would legitimately activate
  // that organization's native Link even when the supplied orgSlug disagrees.
  assert.doesNotMatch(render({ orgSlug: "not-in-the-list", pathname: "/not-in-the-list/secrets/vaults" }), /aria-current="(?:true|page)"|aria-label="Current organization"/, "a missing current organization does not silently select the first row");
});

test("encoded organization destinations drop foreign resource IDs while the current organization's native link stays at its exact location", () => {
  const current = { id: "current", name: "Current Team", slug: "team /?β" };
  const target = { id: "target", name: "Next Team", slug: "next /?#β" };
  const pathname = `/${encodeURIComponent(current.slug)}/secrets/vaults/private-api/environments/private-live`;
  const suffix = "?search=original#focused-secret";
  const html = render({ organizations: [current, target], orgSlug: current.slug, pathname }, suffix);
  assert.deepEqual(options(html).map(href), [`${pathname}${suffix}`, `/${encodeURIComponent(target.slug)}/secrets/vaults`]);
  assert.doesNotMatch(options(html)[1], /private-api|private-live|search=original|focused-secret/);
  assert.doesNotMatch(options(html)[1], /aria-current/);
  assert.match(options(html)[0], /aria-current="(?:true|page)"/);
  const staticPage = render({ pathname: "/payments/observability/logs" });
  assert.deepEqual(options(staticPage).map(href), ["/payments/observability/logs", "/research/observability/logs", "/ops/observability/logs"]);
});

test("search appears only for larger inventories, finds names or slugs, preserves its draft, and announces match counts", () => {
  const html = render({ organizations: searchableOrganizations, query: "  RESEARCH  " });
  const input = html.match(/<input\b[^>]*>/)?.[0] ?? "";
  assert.match(input, /type="search"/); assert.match(input, /aria-label="Search organizations"/);
  assert.match(input, /value=" {2}RESEARCH {2}"/); assert.match(input, /maxLength="200"/);
  assert.match(input, /autoComplete="off"/); assert.match(input, /autoCapitalize="none"/); assert.match(input, /spellCheck="false"/);
  assert.equal(options(html).length, 1); assert.equal(href(options(html)[0]), "/research/secrets/vaults");
  assert.match(html, /role="status" aria-live="polite">1 organization found/);
  assert.equal(options(render({ organizations: searchableOrganizations, query: " ops " })).length, 1);
  assert.equal(options(render({ organizations: searchableOrganizations, query: "   " })).length, searchableOrganizations.length);
  assert.match(render({ organizations: searchableOrganizations, query: "a" }), /role="status" aria-live="polite">6 organizations found/);
  const compact = render({ organizations: searchableOrganizations.slice(0, 5), query: "hidden-stale-query" });
  assert.doesNotMatch(compact, /type="search"|role="status"/);
  assert.equal(options(compact).length, 5, "a hidden stale query cannot hide rows when membership drops below the search threshold");
  assert.deepEqual(organizations.map(({ id }) => id), ["payments", "research", "operations"]);
});

test("empty membership and no search matches are distinct states that keep the create link available", () => {
  const missing = render({ organizations: searchableOrganizations, query: "missing-organization" });
  assert.equal(options(missing).length, 0); assert.match(missing, /No organizations found/); assert.match(missing, /Try another name or slug/);
  assert.match(missing, /0 organizations found/); assert.match(missing, /type="search"/);
  assert.deepEqual(links(missing).map(href), ["/onboarding"]);
  const empty = render({ organizations: [] });
  assert.match(empty, /No organizations yet/); assert.match(empty, /Create an organization to get started/);
  assert.deepEqual(links(empty).map(href), ["/onboarding"]);
  assert.doesNotMatch(empty, /No organizations found|aria-current="(?:true|page)"|type="search"/);
});

test("avatars use decorative safe images or readable initials, without executable image sources or duplicate accessible names", () => {
  const valid = renderToStaticMarkup(React.createElement(OrganizationAvatar, { organization: organizations[1], className: "triggerAvatar" }));
  assert.match(valid, /class="avatar triggerAvatar" aria-hidden="true"/);
  assert.match(valid, /<img[^>]*src="\/logos\/research.png"/);
  assert.match(valid, /alt=""/); assert.match(valid, /draggable="false"/); assert.match(valid, /referrerPolicy="no-referrer"/);
  for (const logo of [undefined, null, "", "javascript:alert(1)", "//evil.test/logo.png", "http://evil.test/logo.png", "data:image/svg+xml;base64,PHN2Zz4=", "/\\evil.test/logo.png"]) {
    const html = renderToStaticMarkup(React.createElement(OrganizationAvatar, { organization: { id: "test", name: "Payments Team", slug: "payments", logo } }));
    assert.doesNotMatch(html, /<img\b|javascript:|evil\.test|data:image/); assert.match(html, />PT<\/span>/);
  }
  assert.match(renderToStaticMarkup(React.createElement(OrganizationAvatar, {})), />O<\/span>/);
  assert.match(renderToStaticMarkup(React.createElement(OrganizationAvatar, { organization: { id: "unicode", name: "Équipe Lagos", slug: "unicode" } })), />ÉL<\/span>/);
});

async function contentController() {
  const source = await readFile(new URL("../src/components/sidebar/organization-switcher-content.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const Link = () => null; const Placeholder = () => null; const module = { exports: {} as any };
  const state: any[] = []; let index = 0;
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return { useState: (initial: any) => {
        const slot = index++; if (!(slot in state)) state[slot] = initial;
        return [state[slot], (next: any) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
      } };
      if (specifier === "@tanstack/react-router") return { Link };
      if (specifier === "lucide-react") return { Check: Placeholder, Plus: Placeholder, Search: Placeholder };
      if (specifier === "./organization-switcher-state") return switcherState;
      if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) };
      throw new Error(`Unexpected organization-switcher dependency: ${specifier}`);
    },
  });
  return {
    Link,
    content(props: OrganizationSwitcherContentProps) { return elements(module.exports.OrganizationSwitcherContent(props)); },
    avatar(organization?: SwitcherOrganization) { index = 0; return elements(module.exports.OrganizationAvatar({ organization })); },
  };
}

test("actual content adapters forward exact organization/event identity, refs, native keyboard handlers, and current/new link URL options", async () => {
  const controller = await contentController();
  const selected: Array<[SwitcherOrganization, React.MouseEvent<HTMLAnchorElement>]> = []; const queries: string[] = [];
  const creates: React.MouseEvent<HTMLAnchorElement>[] = []; const searchRef = { current: null }; const listRef = { current: null };
  const props = { ...defaults, organizations: searchableOrganizations, searchRef, listRef, onQueryChange: (query: string) => queries.push(query),
    onSelect: (organization: SwitcherOrganization, event: React.MouseEvent<HTMLAnchorElement>) => selected.push([organization, event]),
    onCreate: (event: React.MouseEvent<HTMLAnchorElement>) => creates.push(event),
  };
  const nodes = controller.content(props); const input = nodes.find((node) => node.type === "input");
  const list = nodes.find((node) => node.props.ref === listRef); assert.ok(input); assert.ok(list);
  assert.equal(input.props.ref, searchRef); assert.equal(input.props.onKeyDown, props.onSearchKeyDown); assert.equal(list.props.onKeyDown, props.onListKeyDown);
  input.props.onChange({ target: { value: "  unchanged draft  " } }); assert.deepEqual(queries, ["  unchanged draft  "]);
  const rows = nodes.filter((node) => node.type === controller.Link && node.props["data-org-option"] === "");
  for (const [index, row] of rows.entries()) {
    const event = { button: 0, metaKey: index === 1 } as React.MouseEvent<HTMLAnchorElement>;
    row.props.onClick(event); assert.equal(selected[index][0], props.organizations[index]); assert.equal(selected[index][1], event);
  }
  const previousSearch = { query: "current-search", unrelated: "kept" };
  assert.equal(rows[0].props.search(previousSearch), previousSearch);
  assert.equal(rows[0].props.to, defaults.pathname); assert.equal(rows[0].props.hash, true, "a current-organization link preserves anchors when opened in another tab");
  for (const row of rows.slice(1)) { assert.deepEqual(Object.keys(row.props.search), []); assert.equal(row.props.hash, ""); }
  const create = nodes.find((node) => node.type === controller.Link && node.props.to === "/onboarding");
  assert.ok(create); assert.equal(create.props.onClick, props.onCreate);
  const createEvent = { button: 0, ctrlKey: true } as React.MouseEvent<HTMLAnchorElement>; create.props.onClick(createEvent); assert.equal(creates[0], createEvent);
  assert.deepEqual(Object.keys(create.props.search), []); assert.equal(create.props.hash, "");
});

test("a failed logo falls back to initials and a changed logo can load without a stale image error hiding it", async () => {
  const controller = await contentController(); const original = { ...organizations[0], logo: "https://cdn.example.test/original.png" };
  const first = controller.avatar(original).find((node) => node.type === "img"); assert.ok(first);
  first.props.onError();
  const fallback = controller.avatar(original); assert.equal(fallback.some((node) => node.type === "img"), false);
  assert.equal(fallback[0].props.children, "PT");
  const changed = { ...original, logo: "https://cdn.example.test/updated.png" };
  assert.equal(controller.avatar(changed).find((node) => node.type === "img")?.props.src, changed.logo);
  first.props.onError();
  assert.equal(controller.avatar(changed).find((node) => node.type === "img")?.props.src, changed.logo, "an old image's late error cannot suppress a newer URL");
});

test("popover source keeps native focus/Tab behavior with a collision-bounded scrolling list and reduced-motion treatments", async () => {
  const [css, source, workspaceCss] = await Promise.all([
    readFile(new URL("../src/components/sidebar/organization-switcher.module.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/sidebar/organization-dropdown.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.panel\s*\{[^}]*max-width:\s*calc\(100vw - 24px\)/);
  assert.match(css, /\.panel\s*\{[^}]*width:\s*max\(220px, var\(--radix-popover-trigger-width\)\)/);
  assert.match(css, /\.panel\s*\{[^}]*max-height:\s*min\(320px, var\(--radix-popover-content-available-height\)\)/);
  assert.match(css, /\.trigger\s*\{[^}]*min-height:\s*36px/);
  assert.match(css, /\.option\s*\{[^}]*min-height:\s*32px/);
  assert.match(css, /\.avatar\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px/);
  assert.match(workspaceCss, /:root\s*\{[^}]*--workspace-radius-lg:\s*0\.75rem/);
  assert.match(workspaceCss, /\.workspace-ui \.rounded-lg\s*\{[^}]*border-radius:\s*var\(--workspace-radius-lg\)/);
  for (const control of ["trigger", "panel", "option", "create"]) {
    assert.match(css, new RegExp(`\\.${control}\\s*\\{[^}]*border-radius:\\s*var\\(--workspace-radius-lg\\)`), `${control} shares the active sidebar link radius token`);
  }
  assert.match(css, /\.option\[aria-current\]/, "selected styling accepts the router's aria-current=page output");
  assert.match(css, /\.list\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain/);
  assert.equal((css.match(/overflow-y:\s*auto/g) ?? []).length, 1);
  assert.match(css, /\.heading\s*\{[^}]*flex:\s*0 0 auto/); assert.match(css, /\.footer\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(css, /\.option:focus-visible\s*\{[^}]*box-shadow:\s*inset/);
  assert.match(css, /\.create:focus-visible\s*\{[^}]*box-shadow:\s*inset/);
  assert.match(css, /\.search:focus-within\s*\{[^}]*border-color/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none[\s\S]*transition:\s*none/);
  assert.match(source, /<Popover\.Trigger asChild>/); assert.match(source, /<button type="button"/);
  assert.match(source, /<Popover\.Portal>/); assert.match(source, /<Popover\.Content[^>]*collisionPadding=\{12\}/);
  assert.match(source, /onOpenAutoFocus=/); assert.match(source, /onOpenAutoFocus[\s\S]*?searchRef\.current/);
  assert.match(source, /if \(target\) \{\s*event\.preventDefault\(\);\s*target\.focus\(\)/, "an empty membership list lets Radix focus the remaining create link");
  assert.doesNotMatch(source, /event\.key === "Tab"|onEscapeKeyDown=|onPointerDownOutside=|onCloseAutoFocus=/, "Tab, Escape, outside dismissal and trigger focus restoration stay with native/Radix behavior");
});
