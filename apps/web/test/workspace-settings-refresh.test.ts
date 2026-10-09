import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { ProfileSettingsContent, OrganizationSettingsContent, SettingsLoading, SettingsUnavailable } from "../src/components/workspace/settings-content";
import { WorkspacePageHeader } from "../src/components/workspace-page-header";
import { WorkspaceNotice } from "../src/components/workspace/workspace-ui";
import { workspaceFocusTarget } from "../src/components/workspace/workspace-dialog-focus";

Object.assign(globalThis, { React });
const user = { id: "user-1", name: "Ada Lovelace", email: "ada@example.com", emailVerified: true };
const organization = { id: "org-1", name: "Acme", slug: "acme" };
const render = (element: React.ReactNode) => renderToStaticMarkup(element);

function withRouter(element: React.ReactNode) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: ["/acme/settings/organization"] }) });
  return render(React.createElement(RouterContextProvider, { router, children: element }));
}

test("profile presents real identity with semantic read-only details and an icon-only copy action", () => {
  const html = render(React.createElement(ProfileSettingsContent, { user }));
  assert.match(html, /aria-label="Personal profile"/);
  assert.match(html, /<dl[^>]*>/);
  assert.match(html, /<dt>Full name<\/dt>/);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /ada@example.com/);
  assert.match(html, /data-verified="true"/);
  assert.match(html, />Verified<\/span>/);
  assert.match(html, /aria-label="Copy email address"/);
  assert.match(html, /currently read-only/);
  assert.doesNotMatch(html, /<input|Save changes|Edit profile/);
});

test("profile verification is truthful and user content is escaped", () => {
  const html = render(React.createElement(ProfileSettingsContent, { user: { ...user, name: "<script>alert(1)</script>", emailVerified: false } }));
  assert.match(html, /data-verified="false"/);
  assert.match(html, /Not verified/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("avatars use real image with privacy protection or initials", () => {
  assert.match(render(React.createElement(ProfileSettingsContent, { user })), />AL<\/span>/);
  const html = render(React.createElement(ProfileSettingsContent, { user: { ...user, image: "https://example.com/ada.png" } }));
  assert.match(html, /alt="" referrerPolicy="no-referrer"/);
  assert.match(html, /src="https:\/\/example.com\/ada.png"/);
});

test("organization details include copyable identifiers and an org-scoped members link", () => {
  const html = withRouter(React.createElement(OrganizationSettingsContent, { organization, orgSlug: "acme" }));
  assert.match(html, /aria-label="Organization identity"/);
  assert.match(html, /<dt>Organization name<\/dt>/);
  assert.match(html, /<dt>Organization slug<\/dt>/);
  assert.match(html, /<dt>Organization ID<\/dt>/);
  assert.match(html, /aria-label="Copy organization slug"/);
  assert.match(html, /aria-label="Copy organization id"/);
  assert.match(html, /href="\/acme\/members"/);
  assert.match(html, /Members and access/);
  assert.doesNotMatch(html, /<input|Save changes/);
});

test("loading, failed reads and unavailable settings are distinct with relevant actions", () => {
  const loading = render(React.createElement(SettingsLoading));
  assert.match(loading, /aria-label="Loading settings" aria-busy="true"/);
  assert.doesNotMatch(loading, /Not verified|Settings unavailable|org-1/);
  const failed = render(React.createElement(SettingsUnavailable, { error: true, onRetry() {} }));
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Could not load these settings/);
  assert.match(failed, /Try again/);
  const missing = render(React.createElement(SettingsUnavailable, { onRetry() {} }));
  assert.match(missing, /Settings unavailable/);
  assert.match(missing, /Refresh settings/);
});

test("opt-in compact headers keep untouched workspace headers unchanged", () => {
  const compact = render(React.createElement(WorkspacePageHeader, { appearance: "compact", title: "Settings", description: "Your account." }));
  assert.match(compact, /text-xl font-normal/);
  assert.match(compact, /text-\[12px\]/);
  assert.doesNotMatch(compact, />Workspace<\/p>|border-b/);
  const legacy = render(React.createElement(WorkspacePageHeader, { title: "Other page", description: "Untouched." }));
  assert.match(legacy, />Workspace<\/p>/);
  assert.match(legacy, /border-b/);
  assert.match(legacy, /text-\[15px\]/);
});

test("new settings use existing quiet Arc tabs, scoped routes and content-preserving background reads", async () => {
  const layout = await readFile(new URL("../src/routes/$orgSlug/settings.tsx", import.meta.url), "utf8");
  assert.match(layout, /components\/arc\/tabs\/tabs/);
  assert.match(layout, /outray-arc-tunnel-tabs/);
  assert.match(layout, /aria-label="Settings sections"/);
  assert.match(layout, /params: \{ orgSlug \}/);
  assert.match(layout, /TabsContent value=\{tab\} forceMount/);
  const profile = await readFile(new URL("../src/routes/$orgSlug/settings/profile.tsx", import.meta.url), "utf8");
  const org = await readFile(new URL("../src/routes/$orgSlug/settings/organization.tsx", import.meta.url), "utf8");
  assert.match(profile, /!session\?\.user && isPending/);
  assert.match(org, /!organization && isPending/);
  assert.match(org, /org\.slug === orgSlug/);
  assert.doesNotMatch(profile + org, /return null/);
});

test("API token navigation uses the same key icon in outlined and solid variants", async () => {
  const source = await readFile(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
  assert.match(source, /@outray\/icons\/stroke\/Key02Icon/);
  assert.match(source, /@outray\/icons\/solid\/Key02Icon/);
  assert.match(source, /label: "API tokens",\s+icon: Key02Icon,\s+activeIcon: Key02SolidIcon/);
  assert.doesNotMatch(source, /LicenseIcon/);
});

test("workspace feedback uses error alerts and polite status updates", () => {
  assert.match(render(React.createElement(WorkspaceNotice, { message: "Could not save." })), /role="alert"/);
  assert.match(render(React.createElement(WorkspaceNotice, { tone: "success", message: "Saved." })), /role="status"/);
  assert.match(render(React.createElement(WorkspaceNotice, { tone: "info", message: "Read-only." })), /role="status"/);
});

test("settings and dialogs remain mobile-friendly and honor reduced motion", async () => {
  const settings = await readFile(new URL("../src/components/workspace/settings-content.module.css", import.meta.url), "utf8");
  const dialog = await readFile(new URL("../src/components/workspace/workspace-ui.module.css", import.meta.url), "utf8");
  assert.match(settings, /max-width: 900px/);
  assert.match(settings, /max-width: 540px/);
  assert.match(settings, /overflow-wrap: anywhere/);
  assert.match(settings, /prefers-reduced-motion: reduce/);
  assert.match(dialog, /max-height: calc\(100dvh - 48px\)/);
  assert.match(dialog, /overflow-y: auto/);
  assert.match(dialog, /prefers-reduced-motion: reduce/);
});

test("dialog closure restores its opener or a stable page target after row removal", () => {
  const node = (tagName = "BUTTON", connected = true, disabled = false) => ({ tagName, isConnected: connected, matches: () => disabled }) as unknown as HTMLElement;
  const heading = node("H1");
  const scope = { isConnected: true, querySelector: (selector: string) => { assert.equal(selector, "[data-workspace-focus-return]"); return heading; } } as unknown as HTMLElement;
  const opener = node();
  assert.equal(workspaceFocusTarget(opener, scope), opener);
  assert.equal(workspaceFocusTarget(node("BUTTON", false), scope), heading);
  assert.equal(workspaceFocusTarget(node("BUTTON", true, true), scope), heading);
  assert.equal(workspaceFocusTarget(node("BODY"), scope), heading);
  assert.equal(workspaceFocusTarget(null, scope), heading);
  assert.equal(workspaceFocusTarget(null, { ...scope, isConnected: false } as HTMLElement), null);
});
