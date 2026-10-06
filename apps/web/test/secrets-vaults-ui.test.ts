import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { VaultsContent, type VaultsContentProps } from "../src/components/secrets/vaults-content";
import type { SecretEnvironment, SecretProject } from "../src/lib/secrets-client";

Object.assign(globalThis, { React });

function environment(index: number, overrides: Partial<SecretEnvironment> = {}): SecretEnvironment {
  return {
    id: `environment-${index}`, slug: "production", name: "Production", secretCount: 12, revision: 1, isProduction: true,
    createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", ...overrides,
  };
}

function project(index: number, overrides: Partial<SecretProject> = {}): SecretProject {
  return {
    id: `project-${index}`, slug: `vault-${index}`, name: `Vault ${index}`, description: `Application ${index}`,
    environments: [environment(index)], environmentCount: 1, secretCount: 12 + index,
    createdAt: "2026-10-01T12:00:00Z", updatedAt: new Date(Date.UTC(2026, 9, 5, 12, index)).toISOString(), ...overrides,
  };
}

const inventory = Array.from({ length: 8 }, (_, index) => project(index));

function render(overrides: Partial<VaultsContentProps> = {}) {
  const props: VaultsContentProps = {
    orgSlug: "acme", projects: inventory, loading: false, refreshing: false, error: null,
    search: "", sort: "updated", onSearchChange: () => {}, onSortChange: () => {}, onCreate: () => {}, onRetry: () => {},
    ...overrides,
  };
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([org.addChildren([rest])]),
    history: createMemoryHistory({ initialEntries: [`/${encodeURIComponent(props.orgSlug)}/secrets/vaults`] }),
  });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, { router, children: React.createElement(VaultsContent, props) }));
}

const rows = (html: string) => [...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(([row]) => row);
const links = (html: string) => [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(([link]) => link);
const href = (link: string) => link.match(/href="([^"]+)"/)?.[1];
const vaultLinks = (html: string) => links(html).filter((link) => /\/secrets\/vaults\//.test(href(link) ?? "") && !/\/environments\//.test(href(link) ?? ""));
const environmentLinks = (html: string) => links(html).filter((link) => /\/secrets\/vaults\/[^/]+\/environments\//.test(href(link) ?? ""));
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
const textContent = (html: string) => html.replace(/<[^>]*>/g, "");

test("the full catalog renders every vault instead of the six-row overview preview", () => {
  const html = render();
  assert.match(html, /<h1[^>]*>Vaults<\/h1>/);
  assert.match(html, /aria-label="8 vaults"/);
  assert.match(html, /aria-label="Vault catalog"/);
  assert.equal(rows(html).length, 8);
  assert.deepEqual(vaultLinks(html).map(href), Array.from({ length: 8 }, (_, index) => `/acme/secrets/vaults/vault-${7 - index}`));
  assert.equal(environmentLinks(html).length, 8);
  assert.match(html, />All vaults<\/p>/);
  assert.doesNotMatch(html, /Showing 6 of|View all vaults|Secrets summary|number-flow-react|recharts-|<canvas\b/);
  assert.match(html, /@container\/vault-catalog/);
  assert.match(html, /@\[820px\]\/vault-catalog:grid/);
  for (const row of rows(html)) {
    assert.match(row, /min-h-\[88px\]/);
    assert.match(row, /motion-reduce:transition-none/);
  }
});

test("Arc controls retain a labeled native search field, accessible custom sort, and explicit create action", () => {
  const html = render({ search: "  Vault  ", sort: "name" });
  const searchLabel = html.match(/<label for="([^"]+)">Search vaults<\/label>/)?.[1];
  const sortLabel = html.match(/<label for="([^"]+)">Sort vaults<\/label>/)?.[1];
  assert.ok(searchLabel); assert.ok(sortLabel);
  const search = html.match(/<input\b[^>]*type="search"[^>]*>/)?.[0] ?? "";
  assert.ok(search.includes(`id="${searchLabel}"`));
  assert.match(search, /value=" {2}Vault {2}"/);
  assert.match(search, /placeholder="Find a vault or environment…"/);
  assert.match(search, /maxLength="200"/);
  assert.match(search, /autoComplete="off"/);
  assert.match(search, /spellCheck="false"/);
  const sort = buttons(html).find((button) => button.includes('role="combobox"')) ?? "";
  assert.ok(sort.includes(`id="${sortLabel}"`));
  assert.match(sort, /aria-expanded="false"/);
  assert.match(sort, /aria-autocomplete="none"/);
  assert.match(sort, /aria-hidden="true"[^>]*>[\s\S]*?Name/);
  assert.equal(buttons(html).filter((button) => button.includes('role="combobox"')).length, 1);
  const create = buttons(html).find((button) => button.includes("New vault")) ?? "";
  assert.match(create, /aria-haspopup="dialog"/);
  assert.match(create, /tabindex="0"/);
  assert.doesNotMatch(create, /disabled/);
  assert.match(html, /aria-label="Clear search"/);
  assert.match(html, />8 of 8 vaults<\/p>/);
});

test("vault and environment destinations are encoded native sibling links, never nested anchors", () => {
  const orgSlug = "team /?β"; const projectSlug = "api /?#β"; const environmentSlug = "live /?#β";
  const target = project(0, { slug: projectSlug, environments: [environment(0, { slug: environmentSlug, name: "Live" })] });
  const html = render({ orgSlug, projects: [target] });
  const row = rows(html)[0];
  assert.equal(vaultLinks(row).length, 1); assert.equal(environmentLinks(row).length, 1);
  assert.equal(href(vaultLinks(row)[0]), `/${encodeURIComponent(orgSlug)}/secrets/vaults/${encodeURIComponent(projectSlug)}`);
  assert.equal(href(environmentLinks(row)[0]), `/${encodeURIComponent(orgSlug)}/secrets/vaults/${encodeURIComponent(projectSlug)}/environments/${encodeURIComponent(environmentSlug)}`);
  assert.match(vaultLinks(row)[0], /after:absolute after:inset-0 after:z-\[1\]/);
  assert.match(vaultLinks(row)[0], /focus-visible:after:outline-2/);
  assert.match(vaultLinks(row)[0], /<span class="block truncate">Vault 0<\/span>/);
  assert.doesNotMatch(vaultLinks(row)[0].match(/<a\b[^>]*>/)?.[0] ?? "", /truncate|overflow-hidden/, "the primary anchor cannot clip its full-row pseudo overlay");
  assert.match(environmentLinks(row)[0], /relative z-\[2\]/);
  assert.match(environmentLinks(row)[0], /focus-visible:outline-2/);
  assert.match(environmentLinks(row)[0], /title="Open Live in Vault 0"/);
  let depth = 0;
  for (const [tag] of html.matchAll(/<\/?a\b[^>]*>/g)) {
    depth += tag.startsWith("</") ? -1 : 1;
    assert.ok(depth >= 0 && depth <= 1, "vault whole-row affordances cannot wrap environment anchors");
  }
  assert.equal(depth, 0);
  assert.doesNotMatch(row, /<button\b|href="\/acme\//);
});

test("production identity follows its persisted flag, while additional environments link to their full vault", () => {
  const environments = [
    environment(0, { name: "Live", slug: "live", isProduction: true }),
    environment(1, { name: "Production", slug: "production", isProduction: false }),
    environment(2, { name: "Preview", slug: "preview", isProduction: false }),
    environment(3, { name: "Archived", slug: "archived", isProduction: false }),
  ];
  const html = render({ projects: [project(0, { environments, environmentCount: 4 })] });
  const direct = environmentLinks(html);
  assert.equal(direct.length, 3);
  assert.match(direct[0], /lucide-lock-keyhole/);
  assert.match(direct[0], /class="sr-only">Production environment<\/span>/);
  assert.match(direct[0], /text-amber/);
  assert.doesNotMatch(direct[1], /Production environment|text-amber|lucide-lock-keyhole/);
  assert.doesNotMatch(direct[2], /Production environment|text-amber|lucide-lock-keyhole/);
  assert.match(html, /title="4 environments"/);
  assert.match(html, />4<span class="sr-only"> environments<\/span>/);
  const more = vaultLinks(html).find((link) => link.includes('aria-label="View all 4 environments in Vault 0"')) ?? "";
  assert.equal(href(more), "/acme/secrets/vaults/vault-0");
  assert.match(more, />\+1<\/a>/);
  const empty = render({ projects: [project(0, { environments: [], environmentCount: 0, secretCount: 0 })] });
  assert.match(empty, /No environments yet/);
  assert.equal(environmentLinks(empty).length, 0);
  assert.equal(vaultLinks(empty).length, 1);
});

test("catalog search includes every vault and environment name or slug, with complete match counts", () => {
  const archive = project(0, {
    name: "Archive", slug: "settlement-archive", description: "Historical reconciliation",
    environments: [environment(0, { name: "Hidden Canary", slug: "canary-west" })],
  });
  const catalog = [archive, ...inventory.slice(1)];
  for (const search of [" archive ", "SETTLEMENT-ARCHIVE", "reconciliation", "hidden canary", "canary-west"]) {
    const html = render({ projects: catalog, search });
    assert.equal(rows(html).length, 1);
    assert.deepEqual(vaultLinks(html).map(href), ["/acme/secrets/vaults/settlement-archive"]);
    assert.equal(textContent(vaultLinks(html)[0]), "Archive");
    assert.match(html, />1 of 8 vaults<\/p>/);
    assert.doesNotMatch(html, /No matching vaults|Showing 6 of/);
  }
  assert.equal(rows(render({ search: "production" })).length, 8);
  assert.match(render({ search: "production" }), />8 of 8 vaults<\/p>/);
  assert.equal(rows(render({ search: "   " })).length, 8);
});

test("updated ordering uses the newest valid environment revision date, while name sorting ignores dates", () => {
  const latest = "2026-10-05T13:00:00Z";
  const fromEnvironment = project(0, { name: "Zulu", updatedAt: "2026-10-03T12:00:00Z", environments: [environment(0, { updatedAt: "invalid" }), environment(1, { updatedAt: latest })] });
  const fromVault = project(1, { name: "Beta", updatedAt: "2026-10-04T12:00:00Z" });
  const unknown = project(2, { name: "Alpha", updatedAt: "invalid", environments: [environment(2, { updatedAt: "invalid" })] });
  const catalog = [unknown, fromVault, fromEnvironment]; const frozen = JSON.stringify(catalog);
  catalog.forEach((item) => { item.environments.forEach(Object.freeze); Object.freeze(item.environments); Object.freeze(item); });
  Object.freeze(catalog);
  const updated = render({ projects: catalog });
  assert.deepEqual(rows(updated).map((row) => href(vaultLinks(row)[0])), ["/acme/secrets/vaults/vault-0", "/acme/secrets/vaults/vault-1", "/acme/secrets/vaults/vault-2"]);
  assert.match(rows(updated)[0], /dateTime="2026-10-05T13:00:00Z"/);
  assert.match(rows(updated)[0], /<time[^>]*title="[^"]+"/);
  assert.match(rows(updated)[2], /Updated unknown/);
  assert.doesNotMatch(rows(updated)[2], /<time\b|dateTime="invalid"/);
  const named = render({ projects: catalog, sort: "name" });
  assert.deepEqual(rows(named).map((row) => href(vaultLinks(row)[0])), ["/acme/secrets/vaults/vault-2", "/acme/secrets/vaults/vault-1", "/acme/secrets/vaults/vault-0"]);
  assert.equal(JSON.stringify(catalog), frozen, "rendering must not mutate the shared cached catalog");
});

test("initial skeleton mirrors catalog controls and rows without fabricated totals or destinations", () => {
  const html = render({ projects: null, loading: true, refreshing: true });
  assert.match(html, /aria-label="Loading vaults" aria-busy="true"/);
  assert.equal((html.match(/min-h-\[88px\]/g) ?? []).length, 6);
  assert.match(html, /h-9 min-w-\[180px\]/);
  assert.match(html, /h-9 w-\[164px\]/);
  assert.match(html, /@container\/vault-catalog/);
  assert.match(html, /motion-reduce:animate-none/);
  assert.equal(links(html).length, 0);
  assert.equal(rows(html).length, 0);
  assert.doesNotMatch(html, /aria-label="0 vaults"|No matching vaults|Create your first vault|Vaults could not be loaded|type="search"|All vaults/);
  assert.match(html, /New vault/);
});

test("first-load failure, empty catalog, and no search results are separate recoverable states", () => {
  const failed = render({ projects: null, error: "Test load failed" });
  assert.match(failed, /role="alert"/); assert.match(failed, /Vaults could not be loaded/);
  assert.match(failed, /Test load failed/); assert.match(failed, /Try again/);
  assert.doesNotMatch(failed, /Loading vaults|Create your first vault|No matching vaults|aria-label="0 vaults"/);
  const empty = render({ projects: [] });
  assert.match(empty, /aria-label="0 vaults"/); assert.match(empty, /Create your first vault/); assert.match(empty, /Create vault/);
  assert.doesNotMatch(empty, /Vaults could not be loaded|No matching vaults|type="search"|Try again/);
  assert.equal(rows(empty).length, 0);
  const unmatched = render({ search: "missing-vault" });
  assert.match(unmatched, /No matching vaults/); assert.match(unmatched, /Try another name, description, or environment/);
  assert.match(unmatched, /Clear search/); assert.match(unmatched, />0 of 8 vaults<\/p>/);
  assert.match(unmatched, /type="search"[^>]*value="missing-vault"/);
  assert.equal(rows(unmatched).length, 0); assert.equal(links(unmatched).length, 0);
  assert.doesNotMatch(unmatched, /Vaults could not be loaded|Create your first vault|Try again/);
});

test("refreshing and failed-refresh states retain metadata, catalog controls, and current filters", () => {
  const updating = render({ loading: true, refreshing: true, search: "  Vault  ", sort: "name" });
  assert.equal(rows(updating).length, 8);
  assert.match(updating, /role="status" aria-live="polite"/);
  assert.match(updating, /Updating<\/p>/);
  assert.match(updating, /motion-reduce:animate-none/);
  assert.match(updating, /value=" {2}Vault {2}"/);
  assert.doesNotMatch(updating, /Loading vaults|Vaults could not be loaded/);
  const failed = render({ error: "Internal refresh detail", search: "Vault 7", sort: "name" });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Could not refresh vaults\. Showing the last available metadata\./);
  assert.match(failed, /Retry/);
  assert.equal(rows(failed).length, 1);
  assert.deepEqual(vaultLinks(failed).map(href), ["/acme/secrets/vaults/vault-7"]);
  assert.match(failed, /value="Vault 7"/);
  assert.doesNotMatch(failed, /Vaults could not be loaded|Loading vaults|Internal refresh detail/);
});

test("only intended metadata is rendered, even if an object unexpectedly includes plaintext or private transport fields", () => {
  const privateEnvironment = { ...environment(0), value: "private-environment-value", ciphertext: "private-environment-ciphertext", token: "private-environment-token" };
  const privateProject = { ...project(0), environments: [privateEnvironment], value: "private-plaintext", ciphertext: "private-ciphertext", token: "private-token", secrets: [{ key: "PRIVATE_KEY", value: "private-secret-value" }] };
  const html = render({ projects: [privateProject] });
  assert.equal(textContent(vaultLinks(html)[0]), "Vault 0"); assert.match(html, /Application 0/); assert.match(html, /Production environment/);
  assert.doesNotMatch(html, /private-|PRIVATE_KEY|Healthy|All secure|Encrypted at rest|recharts-|<canvas\b/);
});
