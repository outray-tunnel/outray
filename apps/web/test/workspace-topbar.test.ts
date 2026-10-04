import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceAccountMenu } from "../src/components/workspace-account-menu";
import {
  accountMenuFocusIndex,
  workspaceAccountIdentity,
} from "../src/components/workspace-account-menu-state";

// The Node test runner uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

function renderAccount(props: Partial<React.ComponentProps<typeof WorkspaceAccountMenu>> = {}) {
  return renderToStaticMarkup(React.createElement(WorkspaceAccountMenu, {
    user: { name: "Ada Lovelace", email: "ada@example.com" },
    onReportBug: () => {},
    onSignOut: async () => {},
    ...props,
  }));
}

test("the account identity trims names and derives first-and-last initials without placeholder email", () => {
  const identity = workspaceAccountIdentity({ name: "  Ada Lovelace  ", email: "  ada@example.com  " });
  assert.equal(identity.name, "Ada Lovelace");
  assert.equal(identity.email, "ada@example.com");
  assert.equal(identity.initials, "AL");
  assert.equal(workspaceAccountIdentity({ name: "Ada Byron Lovelace" }).initials, "AL");
  assert.equal(workspaceAccountIdentity({ name: "Ada" }).initials, "A");
  assert.equal(workspaceAccountIdentity({ name: "Élodie du Pont" }).initials, "ÉP");
});

test("missing names fall back to real email, then a neutral Account identity", () => {
  const emailOnly = workspaceAccountIdentity({ name: "  ", email: "  jane@example.com " });
  assert.equal(emailOnly.name, "jane@example.com");
  assert.equal(emailOnly.initials, "J");
  for (const user of [undefined, null, {}, { name: " ", email: " " }]) {
    const identity = workspaceAccountIdentity(user);
    assert.equal(identity.name, "Account");
    assert.equal(identity.initials, "A");
    assert.ok(!identity.email);
  }
});

test("the account control shows the user's name and is a named native menu disclosure at rest", () => {
  const html = renderAccount();
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(([button]) => button);
  assert.equal(buttons.length, 1);
  assert.match(buttons[0], /type="button"/);
  assert.match(buttons[0], /aria-label="Account menu for Ada Lovelace"/);
  assert.match(buttons[0], /aria-haspopup="menu"/);
  assert.match(buttons[0], /aria-expanded="false"/);
  assert.match(buttons[0], /aria-controls="[^"]+"/);
  assert.doesNotMatch(buttons[0], /\bdisabled=/);
  assert.match(html, />Ada Lovelace<\/span>/);
  assert.match(html, />AL<\/span>/);
  assert.doesNotMatch(html, /role="menu"|role="menuitem"|user@example\.com/);
});

test("unknown account state renders safe initials and an accessible fallback label", () => {
  const html = renderAccount({ user: null });
  assert.match(html, /aria-label="Account menu for Account"/);
  assert.match(html, />Account<\/span>/);
  assert.match(html, />A<\/span>/);
  assert.doesNotMatch(html, /user@example\.com|undefined|>User<\/span>/);
  const emailOnly = renderAccount({ user: { email: " jane@example.com " } });
  assert.match(emailOnly, /aria-label="Account menu for jane@example.com"/);
  assert.match(emailOnly, />jane@example.com<\/span>/);
  assert.match(emailOnly, />J<\/span>/);
});

test("a supplied avatar is decorative while the account disclosure still names the user", () => {
  const html = renderAccount({
    user: { name: "Ada Lovelace", image: "https://example.com/avatar.png" },
  });
  assert.match(html, /<img\b[^>]*src="https:\/\/example.com\/avatar.png"[^>]*alt=""/);
  assert.match(html, /aria-label="Account menu for Ada Lovelace"/);
  assert.match(html, />Ada Lovelace<\/span>/);
});

test("account loading is clearly labeled and cannot open the menu or show a fake identity", () => {
  const html = renderAccount({ user: undefined, isPending: true });
  assert.match(html, /aria-label="Loading account"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /Account menu for|user@example\.com|Ada Lovelace|role="menu"/);
  assert.equal((html.match(/data-account-placeholder=/g) ?? []).length, 2);
  assert.match(html, /motion-reduce:animate-none/);
});

test("account render does not invoke report-bug or sign-out actions", () => {
  const calls: string[] = [];
  renderAccount({
    onReportBug: () => { calls.push("report"); },
    onSignOut: async () => { calls.push("sign-out"); },
  });
  assert.deepEqual(calls, []);
});

test("menu arrow navigation wraps while Home and End target the first and last actions", () => {
  assert.equal(accountMenuFocusIndex("ArrowDown", 0, 2), 1);
  assert.equal(accountMenuFocusIndex("ArrowDown", 1, 2), 0);
  assert.equal(accountMenuFocusIndex("ArrowUp", 0, 2), 1);
  assert.equal(accountMenuFocusIndex("ArrowUp", 1, 2), 0);
  assert.equal(accountMenuFocusIndex("ArrowDown", -1, 2), 0);
  assert.equal(accountMenuFocusIndex("ArrowUp", -1, 2), 1);
  for (const current of [-5, 2, 99, NaN]) {
    assert.equal(accountMenuFocusIndex("ArrowDown", current, 2), 0);
    assert.equal(accountMenuFocusIndex("ArrowUp", current, 2), 1);
  }
  assert.equal(accountMenuFocusIndex("Home", 1, 2), 0);
  assert.equal(accountMenuFocusIndex("End", 0, 2), 1);
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
    assert.equal(accountMenuFocusIndex(key, 0, 1), 0);
    assert.equal(accountMenuFocusIndex(key, 0, 0), null);
  }
  for (const key of ["Tab", "Enter", " ", "Escape"]) {
    assert.equal(accountMenuFocusIndex(key, 0, 2), null);
  }
});

test("the dashboard places one topbar above independent content scrolling, outside sidebar variants", async () => {
  const layout = await readFile(new URL("../src/routes/$orgSlug.tsx", import.meta.url), "utf8");
  assert.equal((layout.match(/<WorkspaceTopbar\b/g) ?? []).length, 1);
  assert.doesNotMatch(layout, /<MobileHeader\b|<MobileNavigationTrigger\b/);
  assert.match(layout, /<WorkspaceTopbar\b[\s\S]*?<main\b[\s\S]*?data-scroll-restoration-id=\{`workspace-content-/);
  assert.doesNotMatch(layout, /\{!?unifiedSidebar && <WorkspaceTopbar/);
  assert.match(layout, /flex h-dvh overflow-hidden/);
  assert.match(layout, /hidden md:flex h-full/);
  assert.match(layout, /min-h-0 flex-1 overflow-y-auto/);
});

test("workspace content owns wider responsive gutters while preserving vertical padding and mobile safe area", async () => {
  const layout = await readFile(new URL("../src/routes/$orgSlug.tsx", import.meta.url), "utf8");
  const content = layout.match(/data-scroll-restoration-id=\{`workspace-content-[\s\S]*?className="([^"]+)"/);
  assert.ok(content);
  const classes = content[1].split(/\s+/);
  for (const expected of ["px-6", "py-5", "md:px-12", "md:py-8", "md:pb-8", "pb-[calc(80px+env(safe-area-inset-bottom))]"]) {
    assert.ok(classes.includes(expected), `shared content retains ${expected}`);
  }
  assert.ok(!classes.includes("p-5") && !classes.includes("md:p-8"), "all-axis utilities must not override the wider gutters");
  assert.match(layout, /data-scroll-restoration-id=\{`workspace-content-[\s\S]*?<Outlet\s*\/>/);
});

test("identity and account actions live in the common topbar, not a duplicate sidebar footer", async () => {
  const [sidebar, topbar, mobileTrigger] = await Promise.all([
    readFile(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/workspace-topbar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/mobile-header.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(sidebar, /\bUserSection\b|\.useSession\(/);
  assert.equal((topbar.match(/\.useSession\(/g) ?? []).length, 1);
  assert.equal((topbar.match(/<WorkspaceAccountMenu\b/g) ?? []).length, 1);
  assert.equal((topbar.match(/<MobileNavigationTrigger\b/g) ?? []).length, 1);
  assert.match(topbar, /aria-label="Workspace top bar"/);
  assert.match(topbar, /<WorkspaceAccountMenu\b[\s\S]*?user=\{user\}[\s\S]*?isPending=\{isPending\}[\s\S]*?onReportBug=[\s\S]*?onSignOut=\{signOut\}/);
  assert.match(topbar, /userEmail=\{user\?\.email\}/);
  assert.match(topbar, /userName=\{user\?\.name\}/);
  assert.match(topbar, /await authClient\.signOut\(\)[\s\S]*?if \(result\.error\) throw[\s\S]*?await navigate/);
  assert.doesNotMatch(mobileTrigger, /<header\b/);
  assert.match(mobileTrigger, /export function MobileNavigationTrigger/);
  assert.match(mobileTrigger, /<button\b[\s\S]*?type="button"/);
  assert.match(mobileTrigger, /aria-expanded=\{isNavigationOpen\}/);
  assert.match(mobileTrigger, /aria-controls="mobile-workspace-navigation"/);
});
