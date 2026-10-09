import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { OrganizationAccessPage, OrganizationAccessSkeleton } from "../src/components/organization/organization-access-page";
import type { SwitcherOrganization } from "../src/components/sidebar/organization-switcher-state";

// Components use the project's classic JSX transform in Node tests.
Object.assign(globalThis, { React });

type PageProps = React.ComponentProps<typeof OrganizationAccessPage>;
const organizations: SwitcherOrganization[] = [
  { id: "payments", name: "Payments Team", slug: "payments" },
  { id: "research", name: "Research Labs", slug: "research", logo: "/logos/research.png" },
  { id: "operations", name: "Operations", slug: "ops" },
];
const defaults: PageProps = { organizations, orgSlug: "missing-team" };

function renderWithRouter(children: React.ReactNode, pathname = "/missing-team") {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({ routeTree: root.addChildren([org.addChildren([rest])]), history: createMemoryHistory({ initialEntries: [pathname] }) });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, {
    router, children,
  }));
}

function renderPage(overrides: Partial<PageProps> = {}) {
  const props = { ...defaults, ...overrides };
  const pathname = `/${encodeURIComponent(props.orgSlug)}${props.remainingPath ? `/${props.remainingPath.replace(/^\/+/, "")}` : ""}`;
  return renderWithRouter(React.createElement(OrganizationAccessPage, props), pathname);
}

const links = (html: string) => [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(([link]) => link);
const href = (link: string) => link.match(/href="([^"]+)"/)?.[1];
const textContent = (html: string) => html.replace(/<[^>]*>/g, "");
const organizationLinks = (html: string) => {
  const nav = html.match(/<nav\b[^>]*aria-label="Organizations"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, "the organization inventory is a labeled native navigation region");
  return links(nav);
};

test("unavailable organizations show a single clear heading and the complete accessible membership inventory", () => {
  const html = renderPage();
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<h1\b[^>]*>Organization not found<\/h1>/);
  assert.match(html, /<nav\b[^>]*aria-label="Organizations"/);
  assert.match(html, /<ul\b/);
  const rows = organizationLinks(html);
  assert.equal(rows.length, organizations.length);
  for (const [index, row] of rows.entries()) {
    assert.ok(textContent(row).includes(organizations[index].name));
    assert.ok(textContent(row).includes(organizations[index].slug));
    assert.equal(href(row), `/${organizations[index].slug}/tunnel`);
    assert.doesNotMatch(row, /<button\b|<input\b|role="button"|role="menuitem"|tabindex="-1"|aria-current=/);
  }
  assert.doesNotMatch(html, /<button\b[^>]*>[\s\S]*?<button\b/, "native links are not nested inside button controls");
});

test("the select route preserves the requested product path in every organization destination", () => {
  for (const remainingPath of ["tunnel", "tunnel/tunnels", "tunnel/tunnels/private-tunnel", "tunnel/requests", "tunnels", "observability/logs", "secrets/vaults", "secrets/vaults/private-api/environments/live"]) {
    const html = renderPage({ orgSlug: "select", isSelectRoute: true, remainingPath });
    assert.match(html, /<h1\b[^>]*>Choose an organization<\/h1>/);
    assert.doesNotMatch(html, /Organization not found/);
    assert.deepEqual(organizationLinks(html).map(href), organizations.map(({ slug }) => `/${slug}/${remainingPath}`));
  }
  assert.deepEqual(organizationLinks(renderPage({ orgSlug: "select", isSelectRoute: true })).map(href), organizations.map(({ slug }) => `/${slug}/tunnel`));
});

test("an unavailable organization never carries another organization's resource IDs into a membership link", () => {
  for (const remainingPath of ["tunnels/private-tunnel", "tunnel/tunnels/private-tunnel", "secrets/vaults/private-api/environments/private-live", "uptime/monitors/private-monitor", "observability/alerts/private-alert"]) {
    const html = renderPage({ orgSlug: "foreign-team", remainingPath });
    assert.deepEqual(organizationLinks(html).map(href), organizations.map(({ slug }) => `/${slug}/tunnel`));
    for (const row of organizationLinks(html)) assert.doesNotMatch(row, /private-tunnel|private-api|private-live|private-monitor|private-alert/);
  }
});

test("organization slugs are escaped as one URL segment and membership text stays non-executable", () => {
  const encodedOrganizations = [
    { id: "encoded", name: "Next Team", slug: "next /?#β" },
    { id: "escaped", name: '<script>alert("team")</script>', slug: "research" },
  ];
  const html = renderPage({ organizations: encodedOrganizations, orgSlug: "select", isSelectRoute: true, remainingPath: "observability/logs" });
  assert.deepEqual(organizationLinks(html).map(href), encodedOrganizations.map(({ slug }) => `/${encodeURIComponent(slug)}/observability/logs`));
  assert.match(html, /&lt;script&gt;alert\(&quot;team&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script\b/);
  assert.deepEqual(organizationLinks(renderPage({ organizations: encodedOrganizations })).map(href), encodedOrganizations.map(({ slug }) => `/${encodeURIComponent(slug)}/tunnel`));
});

test("rows display decorative logos and readable initials without unsafe image sources", () => {
  const html = renderPage();
  const rows = organizationLinks(html);
  assert.match(rows[0], />PT<\/span>/);
  assert.match(rows[1], /<img\b[^>]*src="\/logos\/research.png"/);
  assert.match(rows[1], /alt=""/);
  assert.match(rows[1], /aria-hidden="true"/);
  assert.match(rows[2], />O<\/span>/);
  for (const logo of ["javascript:alert(1)", "//evil.test/logo.png", "http://evil.test/logo.png", "data:image/svg+xml;base64,PHN2Zz4=", "/\\evil.test/logo.png"]) {
    const row = organizationLinks(renderPage({ organizations: [{ ...organizations[0], logo }] }))[0];
    assert.match(row, />PT<\/span>/);
    assert.doesNotMatch(row, /<img\b|javascript:|evil\.test|data:image/);
  }
});

test("organization search is available only above five memberships and all rows are initially visible", () => {
  const inventory = Array.from({ length: 8 }, (_, index) => ({ id: `organization-${index}`, name: `Workspace ${index}`, slug: `workspace-${index}` }));
  for (const count of [0, 1, 5]) {
    const html = renderPage({ organizations: inventory.slice(0, count) });
    assert.doesNotMatch(html, /<input\b[^>]*type="search"/);
    if (count) assert.equal(organizationLinks(html).length, count);
  }
  for (const count of [6, 8]) {
    const html = renderPage({ organizations: inventory.slice(0, count) });
    const input = html.match(/<input\b[^>]*>/)?.[0] ?? "";
    assert.match(input, /type="search"/);
    assert.match(input, /aria-label="Search organizations"/);
    assert.equal(organizationLinks(html).length, count);
  }
});

test("loading organizations uses a quiet status skeleton with no error heading or organization destinations", () => {
  const html = renderWithRouter(React.createElement(OrganizationAccessSkeleton));
  assert.match(html, /role="status"/);
  assert.match(html, /aria-label="Loading organizations"/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /Organization not found|Choose an organization|role="alert"|<h1\b|<nav\b|data-org-option=|<button\b|<input\b/);
  assert.ok(links(html).every((link) => href(link) === "/"), "only the shared home navigation remains available while organizations load");
});

test("organization access styling keeps the restrained heading, responsive bounds, focus visibility and reduced motion", async () => {
  const css = await readFile(new URL("../src/components/organization/organization-access-page.module.css", import.meta.url), "utf8");
  const rule = css.match(/\.heading\s+h1\s*\{[^}]*\}/)?.[0];
  assert.ok(rule, "the title has an explicit CSS rule");
  assert.match(rule, /font-size:\s*20px/);
  assert.match(rule, /font-weight:\s*(?:400|normal)/);
  assert.match(css, /min-height:\s*100svh/);
  assert.match(css, /@media\s*\(max-width:/);
  assert.match(css, /:focus-visible\s*\{[^}]*(?:outline|box-shadow):/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*(?:animation|transition):\s*none/);
});
