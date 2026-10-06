import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import ts from "typescript";
import * as switcherState from "../src/components/sidebar/organization-switcher-state";
import type { OrganizationDropdownProps } from "../src/components/sidebar/organization-dropdown";
import type { OrganizationSwitcherContentProps } from "../src/components/sidebar/organization-switcher-content";

const organizations: switcherState.SwitcherOrganization[] = [
  { id: "alpha-id", name: "Alpha Team", slug: "alpha" },
  { id: "beta-id", name: "Beta Team", slug: "beta" },
  { id: "gamma-id", name: "Gamma Team", slug: "gamma" },
];
const searchableOrganizations = [...organizations,
  { id: "delta-id", name: "Delta Team", slug: "delta" },
  { id: "epsilon-id", name: "Epsilon Team", slug: "epsilon" },
  { id: "zeta-id", name: "Zeta Team", slug: "zeta" },
];
type Props = { children?: React.ReactNode; [key: string]: any };
function elements(node: React.ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function event(overrides: Props = {}) {
  return { key: "", button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    defaultPrevented: false, nativeEvent: { isComposing: false },
    preventDefault() { this.defaultPrevented = true; }, ...overrides };
}

/** Run the actual controlled dropdown hooks and content; model only Radix and native focus/link boundaries. */
async function controller(initial: Partial<OrganizationDropdownProps> = {}) {
  const [source, contentSource] = await Promise.all([
    readFile(new URL("../src/components/sidebar/organization-dropdown.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/sidebar/organization-switcher-content.tsx", import.meta.url), "utf8"),
  ]);
  const compile = (input: string) => ts.transpileModule(input, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const values: any[] = [];
  let index = 0;
  const writes: Array<switcherState.SwitcherOrganization | null> = [], changes: boolean[] = [];
  let props: OrganizationDropdownProps = { organizations, isOrgDropdownOpen: false, isCollapsed: false,
    setSelectedOrganization: (organization) => writes.push(organization),
    setIsOrgDropdownOpen: (open) => { changes.push(open); props = { ...props, isOrgDropdownOpen: open }; }, ...initial };
  const document = { activeElement: null as FocusTarget | null };
  class FocusTarget {
    focuses = 0;
    clicks = 0;
    link: Props | null = null;
    lastClick: ReturnType<typeof event> | null = null;
    focus() { this.focuses++; document.activeElement = this; }
    click() { this.clicks++; this.lastClick = event(); this.link?.onClick(this.lastClick); }
  }
  const search = new FocusTarget(), trigger = new FocusTarget();
  const anchors = new Map<string, FocusTarget>();
  const optionQueries: string[] = [];
  let filtered: FocusTarget[] = [];
  const list = { querySelectorAll(selector: string) { optionQueries.push(selector); assert.equal(selector, "[data-org-option]"); return filtered; } };
  const hooks = { ...React,
    useState(initial: any) {
      const slot = index++;
      if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
      return [values[slot], (next: any) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
    },
    useRef(initial: any) { const slot = index++; return values[slot] ?? (values[slot] = { current: initial }); },
  };
  const Root = (_props: Props) => null, Trigger = (_props: Props) => null, Portal = (_props: Props) => null, Panel = (_props: Props) => null;
  const Link = (_props: Props) => null, Icon = (_props: Props) => null;
  const router = { Link, useLocation: () => ({ pathname: "/alpha/secrets/vaults/payments/environments/production" }),
    useParams: () => ({ orgSlug: "alpha" }) };
  function evaluate(input: string, require: (specifier: string) => any) {
    const module = { exports: {} as any };
    runInNewContext(compile(input), { React, document, module, exports: module.exports, require });
    return module.exports;
  }
  const contentModule = evaluate(contentSource, (specifier) => {
    if (specifier === "react") return hooks;
    if (specifier === "@tanstack/react-router") return router;
    if (specifier === "lucide-react") return { Check: Icon, Plus: Icon, Search: Icon };
    if (specifier === "./organization-switcher-state") return switcherState;
    if (specifier.endsWith(".css")) return {};
    throw new Error(`Unexpected organization content dependency: ${specifier}`);
  });
  const module = evaluate(source, (specifier) => {
    if (specifier === "react") return hooks;
    if (specifier === "@tanstack/react-router") return router;
    if (specifier === "@radix-ui/react-popover") return { Root, Trigger, Portal, Content: Panel };
    if (specifier === "./organization-switcher-content") return contentModule;
    if (specifier === "@hugeicons/react") return { HugeiconsIcon: Icon };
    if (specifier.startsWith("@hugeicons-pro/")) return {};
    if (specifier.endsWith(".css")) return {};
    throw new Error(`Unexpected organization dropdown dependency: ${specifier}`);
  });
  function render() {
    index = 0;
    const tree = elements(module.OrganizationDropdown(props));
    const root = tree.find((element) => element.type === Root), portal = tree.find((element) => element.type === Portal), panel = tree.find((element) => element.type === Panel);
    const button = tree.find((element) => element.type === "button"), content = tree.find((element) => element.type === contentModule.OrganizationSwitcherContent);
    assert.ok(root); assert.ok(portal); assert.ok(panel); assert.ok(button); assert.ok(content);
    assert.ok(elements(portal.props.children).includes(panel), "the popover panel remains inside Radix's body portal boundary");
    const contentProps = content.props as unknown as OrganizationSwitcherContentProps;
    contentProps.listRef.current = list as unknown as HTMLDivElement;
    const contentTree = elements(contentModule.OrganizationSwitcherContent(content.props));
    const searchInput = contentTree.find((element) => element.type === "input" && element.props["aria-label"] === "Search organizations");
    contentProps.searchRef.current = searchInput ? search as unknown as HTMLInputElement : null;
    const links = contentTree.filter((element) => element.type === Link && "data-org-option" in element.props);
    filtered = links.map((link) => {
      const avatar = elements(link.props.children).find((child) => child.type === contentModule.OrganizationAvatar);
      assert.ok(avatar); const slug = avatar.props.organization.slug as string;
      const anchor = anchors.get(slug) ?? new FocusTarget(); anchors.set(slug, anchor); anchor.link = link.props; return anchor;
    });
    return { root: root.props, panel: panel.props, trigger: button.props, content: contentProps, links: links.map((link) => link.props) };
  }
  return {
    render, writes, changes, document, search, trigger, anchors, optionQueries,
    setProps(next: Partial<OrganizationDropdownProps>) { props = { ...props, ...next }; },
    openByClick() { const view = render(); view.trigger.onClick(event()); view.root.onOpenChange(true); return render(); },
  };
}

test("collapsed and expanded sidebar triggers can open one portaled popover on the correct side", async () => {
  for (const isCollapsed of [true, false]) {
    for (const inventory of [organizations, searchableOrganizations]) {
      const view = await controller({ isCollapsed, organizations: inventory });
      let rendered = view.render(); assert.equal(rendered.root.open, false); assert.equal(rendered.trigger.disabled, false);
      assert.equal(rendered.trigger["aria-label"], "Switch organization, Alpha Team");
      rendered = view.openByClick(); assert.equal(rendered.root.open, true);
      assert.equal(rendered.panel.side, isCollapsed ? "right" : "bottom"); assert.equal(rendered.panel.align, "start");
      assert.equal(rendered.panel.sideOffset, 8); assert.ok(rendered.panel.collisionPadding > 0);
      const focus = event(); rendered.panel.onOpenAutoFocus(focus);
      assert.equal(focus.defaultPrevented, true); assert.equal(view.document.activeElement, inventory.length > 5 ? view.search : view.anchors.get("alpha"));
      assert.equal(Boolean(rendered.content.searchRef.current), inventory.length > 5);
      assert.equal(rendered.panel.onCloseAutoFocus, undefined, "leave close focus restoration to Radix's trigger behavior");
    }
  }
});

test("plain current selection prevents navigation without a store write; another organization closes and leaves navigation to its native link", async () => {
  const view = await controller(); let rendered = view.openByClick();
  const current = rendered.links[0], previousSearch = { service: "payments", q: "API" };
  assert.equal(current.to, "/alpha/secrets/vaults/payments/environments/production"); assert.equal(current.search(previousSearch), previousSearch); assert.equal(current.hash, true);
  const same = event(); rendered.content.onSelect(organizations[0], same);
  assert.equal(same.defaultPrevented, true); assert.equal(view.writes.length, 0); assert.equal(view.render().root.open, false);
  rendered = view.openByClick(); assert.equal(rendered.links[1].to, "/beta/secrets/vaults");
  assert.deepEqual(Object.keys(rendered.links[1].search), []); assert.equal(rendered.links[1].hash, "");
  const other = event(); rendered.content.onSelect(organizations[1], other);
  assert.equal(other.defaultPrevented, false, "the controller must not replace native Link navigation");
  assert.deepEqual(view.writes, [organizations[1]]); assert.equal(view.render().root.open, false);
});

test("modified, middle and already-handled organization clicks preserve native navigation without closing or writing selected state", async () => {
  const view = await controller(); const rendered = view.openByClick();
  for (const override of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    const click = event(override); rendered.content.onSelect(organizations[1], click);
    assert.equal(click.defaultPrevented, Boolean(override.defaultPrevented)); assert.equal(view.render().root.open, true);
    assert.equal(view.writes.length, 0); assert.deepEqual(view.changes, [true]);
  }
  const modifiedCreate = event({ metaKey: true }); rendered.content.onCreate(modifiedCreate);
  assert.equal(view.render().root.open, true); assert.equal(modifiedCreate.defaultPrevented, false);
  const create = event(); view.render().content.onCreate(create);
  assert.equal(create.defaultPrevented, false); assert.equal(view.render().root.open, false); assert.equal(view.writes.length, 0);
});

test("closing and reopening resets search, while trigger arrows on an open filtered popover preserve query and focus existing options", async () => {
  const view = await controller({ organizations: searchableOrganizations }); view.openByClick().content.onQueryChange("beta");
  let rendered = view.render(); assert.equal(rendered.content.query, "beta"); assert.equal(rendered.links.length, 1);
  for (const key of ["ArrowDown", "ArrowUp"]) {
    const arrow = event({ key }); rendered.trigger.onKeyDown(arrow); rendered = view.render();
    assert.equal(arrow.defaultPrevented, true); assert.equal(rendered.content.query, "beta");
    assert.equal(view.document.activeElement, view.anchors.get("beta")); assert.deepEqual(view.changes, [true]);
  }
  rendered.root.onOpenChange(false); assert.equal(view.render().content.query, "");
  rendered = view.openByClick(); assert.equal(rendered.content.query, ""); assert.equal(rendered.links.length, searchableOrganizations.length);
});

test("closed trigger ArrowUp focuses the last organization; default focus uses the first row or search and empty lists leave Radix autofocus intact", async () => {
  const view = await controller(); const up = event({ key: "ArrowUp" }); view.render().trigger.onKeyDown(up);
  let rendered = view.render(); assert.equal(up.defaultPrevented, true); assert.equal(rendered.root.open, true);
  rendered.panel.onOpenAutoFocus(event()); assert.equal(view.document.activeElement, view.anchors.get("gamma"));
  rendered.root.onOpenChange(false); view.render().trigger.onKeyDown(event({ key: "ArrowDown" })); rendered = view.render();
  rendered.panel.onOpenAutoFocus(event()); assert.equal(view.document.activeElement, view.anchors.get("alpha"));
  const large = await controller({ organizations: searchableOrganizations }); large.render().trigger.onKeyDown(event({ key: "ArrowDown" }));
  large.render().panel.onOpenAutoFocus(event()); assert.equal(large.document.activeElement, large.anchors.get("alpha"));
  const empty = await controller({ organizations: [] }); empty.render().trigger.onKeyDown(event({ key: "ArrowUp" }));
  const focus = event(); empty.render().panel.onOpenAutoFocus(focus);
  assert.equal(focus.defaultPrevented, false, "Radix should be allowed to focus the Create organization link when no row/search exists");
});

test("search arrows focus matches; Enter selects only a nonempty noncomposing query and no-match search stays open", async () => {
  const view = await controller({ organizations: searchableOrganizations }); let rendered = view.openByClick();
  for (const [key, slug] of [["ArrowDown", "alpha"], ["ArrowUp", "zeta"]]) {
    const arrow = event({ key }); rendered.content.onSearchKeyDown(arrow);
    assert.equal(arrow.defaultPrevented, true); assert.equal(view.document.activeElement, view.anchors.get(slug));
  }
  for (const query of ["", " \t "]) {
    rendered.content.onQueryChange(query); rendered = view.render();
    const enter = event({ key: "Enter" }); rendered.content.onSearchKeyDown(enter);
    assert.equal(enter.defaultPrevented, false); assert.equal(view.render().root.open, true); assert.equal(view.writes.length, 0);
  }
  rendered.content.onQueryChange("beta"); rendered = view.render();
  const composing = event({ key: "Enter", nativeEvent: { isComposing: true } }); rendered.content.onSearchKeyDown(composing);
  assert.equal(composing.defaultPrevented, false); assert.equal(view.writes.length, 0); assert.equal(view.render().root.open, true);
  const enter = event({ key: "Enter" }); rendered.content.onSearchKeyDown(enter);
  assert.equal(enter.defaultPrevented, true); assert.equal(view.anchors.get("beta")?.clicks, 1);
  assert.deepEqual(view.writes, [organizations[1]]); assert.equal(view.render().root.open, false);
  rendered = view.openByClick(); rendered.content.onQueryChange("missing"); rendered = view.render();
  assert.equal(rendered.links.length, 0); rendered.content.onSearchKeyDown(event({ key: "Enter" }));
  assert.equal(view.render().root.open, true); assert.equal(view.writes.length, 1);
});

test("list arrows and Home/End move focus, while native Tab and Enter remain unhandled", async () => {
  const view = await controller(); const rendered = view.openByClick();
  const alpha = view.anchors.get("alpha")!, beta = view.anchors.get("beta")!, gamma = view.anchors.get("gamma")!;
  for (const [start, key, expected] of [[alpha, "ArrowDown", beta], [gamma, "ArrowDown", alpha], [beta, "ArrowUp", alpha], [alpha, "ArrowUp", gamma], [beta, "Home", alpha], [beta, "End", gamma]] as const) {
    start.focus(); const arrow = event({ key }); rendered.content.onListKeyDown(arrow);
    assert.equal(arrow.defaultPrevented, true); assert.equal(view.document.activeElement, expected);
  }
  for (const shiftKey of [true, false]) {
    beta.focus(); const tab = event({ key: "Tab", shiftKey }); rendered.content.onListKeyDown(tab as any);
    assert.equal(tab.defaultPrevented, false); assert.equal(view.document.activeElement, beta);
  }
  beta.focus(); const enter = event({ key: "Enter" }); rendered.content.onListKeyDown(enter as any);
  assert.equal(enter.defaultPrevented, false); assert.equal(view.writes.length, 0);
  view.search.focus(); const unrelated = event({ key: "Home" }); rendered.content.onListKeyDown(unrelated as any);
  assert.equal(unrelated.defaultPrevented, false, "list shortcuts must not intercept input or footer focus");
  const large = await controller({ organizations: searchableOrganizations }); const searchable = large.openByClick();
  large.anchors.get("alpha")!.focus(); const up = event({ key: "ArrowUp" }); searchable.content.onListKeyDown(up as any);
  assert.equal(up.defaultPrevented, true); assert.equal(large.document.activeElement, large.search);
  for (const shiftKey of [true, false]) {
    const tab = event({ key: "Tab", shiftKey }); searchable.content.onSearchKeyDown(tab as any);
    assert.equal(tab.defaultPrevented, false); assert.equal(large.document.activeElement, large.search);
  }
});

test("pending organization data disables the trigger and prevents controlled or keyboard opening", async () => {
  const view = await controller({ isLoading: true, isOrgDropdownOpen: true, isCollapsed: true });
  let rendered = view.render(); assert.equal(rendered.root.open, false); assert.equal(rendered.trigger.disabled, true);
  assert.equal(rendered.trigger["aria-label"], "Loading organizations"); assert.equal(rendered.trigger["aria-busy"], true);
  rendered.root.onOpenChange(true); rendered.trigger.onKeyDown(event({ key: "ArrowDown" }));
  assert.deepEqual(view.changes, []); assert.equal(view.render().root.open, false);
  view.setProps({ isLoading: false, isOrgDropdownOpen: false }); rendered = view.openByClick();
  assert.equal(rendered.root.open, true); assert.equal(rendered.trigger.disabled, false); assert.deepEqual(view.changes, [true]);
});
