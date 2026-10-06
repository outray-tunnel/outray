import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import {
  SecretsOverviewContent,
  type SecretsOverviewContentProps,
} from "../src/components/secrets/overview-content";
import {
  filterOverviewVaults,
  normalizeSecretsOverviewSearch,
  vaultUpdatedAt,
} from "../src/components/secrets/overview-data";
import type {
  SecretEnvironment,
  SecretProject,
  SecretsOverview,
} from "../src/lib/secrets-client";

Object.assign(globalThis, { React });

function environment(index: number, overrides: Partial<SecretEnvironment> = {}): SecretEnvironment {
  return {
    id: `environment-${index}`,
    slug: "production",
    name: "Production",
    secretCount: 12,
    revision: 1,
    isProduction: true,
    createdAt: "2026-10-01T12:00:00Z",
    updatedAt: "2026-10-01T12:00:00Z",
    ...overrides,
  };
}

function project(index: number, overrides: Partial<SecretProject> = {}): SecretProject {
  return {
    id: `project-${index}`,
    slug: `vault-${index}`,
    name: `Vault ${index}`,
    description: `Application ${index}`,
    environments: [environment(index)],
    environmentCount: 1,
    secretCount: 12 + index,
    createdAt: "2026-10-01T12:00:00Z",
    updatedAt: new Date(Date.UTC(2026, 9, 5, 12, index)).toISOString(),
    ...overrides,
  };
}

const inventory = Array.from({ length: 8 }, (_, index) => project(index));
const data: SecretsOverview = {
  projectCount: 8,
  environmentCount: 16,
  secretCount: 3124,
  projects: inventory,
  recentActivity: [],
};

function render(overrides: Partial<SecretsOverviewContentProps> = {}) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([org.addChildren([rest])]),
    history: createMemoryHistory({ initialEntries: ["/acme/secrets"] }),
  });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, {
    router,
    children: React.createElement(SecretsOverviewContent, {
      orgSlug: "acme",
      data,
      searchInput: "",
      sort: "updated",
      onSearchInputChange: () => {},
      onSortChange: () => {},
      onClearSearch: () => {},
      onCreate: () => {},
      onRetry: () => {},
      ...overrides,
    }),
  }));
}

function vaultLinks(html: string, orgSlug = "acme") {
  return [...html.matchAll(new RegExp(`<a\\b[^>]*href="/${orgSlug}/secrets/vaults/([^"]+)"[^>]*>[\\s\\S]*?<\\/a>`, "g"))];
}

function summaryValues(html: string) {
  const summary = html.match(/<section aria-label="Secrets summary"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";
  return [...summary.matchAll(/role="img" aria-label="([^"]+)"/g)].map(([, value]) => value);
}

test("initial loading mirrors the compact overview without showing invented zero totals", () => {
  const html = render({ data: undefined, loading: true });
  assert.match(html, /aria-label="Loading Secrets overview" aria-busy="true"/);
  assert.equal((html.match(/h-\[120px\]/g) ?? []).length, 3);
  assert.equal((html.match(/min-h-\[76px\]/g) ?? []).length, 12);
  assert.match(html, /motion-reduce:animate-none/);
  assert.doesNotMatch(html, /number-flow-react|Secrets summary|Secrets unavailable|Create your first vault|No matching vaults/);
  assert.equal(vaultLinks(html).length, 0);
});

test("first-load failure, no vaults, and search misses are separate recoverable states", () => {
  const failed = render({ data: undefined, error: "Test load failed" });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Secrets unavailable/);
  assert.match(failed, /Test load failed/);
  assert.match(failed, /Try again/);
  assert.doesNotMatch(failed, /number-flow-react|Create your first vault|No matching vaults|No recent activity/);

  const empty = render({ data: { ...data, projectCount: 0, environmentCount: 0, secretCount: 0, projects: [] } });
  assert.match(empty, /Create your first vault/);
  assert.match(empty, /Create vault/);
  assert.match(empty, /No recent activity/);
  assert.equal((empty.match(/<number-flow-react\b/g) ?? []).length, 3);
  assert.deepEqual(summaryValues(empty), ["0", "0", "0"]);
  assert.doesNotMatch(empty, /Secrets unavailable|No matching vaults|type="search"|Try again/);

  const unmatched = render({ searchInput: "not-a-real-vault" });
  assert.match(unmatched, /No matching vaults/);
  assert.match(unmatched, /Try another name, description, or environment/);
  assert.match(unmatched, /Clear search/);
  assert.match(unmatched, /type="search"[^>]*value="not-a-real-vault"/);
  assert.equal(vaultLinks(unmatched).length, 0);
  assert.equal((unmatched.match(/<number-flow-react\b/g) ?? []).length, 3);
  assert.deepEqual(summaryValues(unmatched), ["8", "16", "3,124"]);
  assert.doesNotMatch(unmatched, /Create your first vault|Secrets unavailable|Try again/);
});

test("background loading keeps visible totals, vaults, and the user's untrimmed input", () => {
  const html = render({ loading: true, isFetching: true, searchInput: "  Vault  ", sort: "name" });
  assert.match(html, /role="status"[^>]*>Updating<\/span>/);
  assert.match(html, /type="search"[^>]*value=" {2}Vault {2}"/);
  assert.match(html, /Sort vaults/);
  assert.equal((html.match(/<number-flow-react\b/g) ?? []).length, 3);
  assert.deepEqual(summaryValues(html), ["8", "16", "3,124"]);
  assert.deepEqual(vaultLinks(html).map(([, slug]) => slug), ["vault-0", "vault-1", "vault-2", "vault-3", "vault-4", "vault-5"]);
  assert.doesNotMatch(html, /Loading Secrets overview|Secrets unavailable|No matching vaults/);
});

test("a failed refresh retains data and filters while exposing a retry", () => {
  const html = render({ error: "Test refresh failed", searchInput: "Vault 7", sort: "name" });
  assert.match(html, /role="alert"/);
  assert.match(html, /Could not refresh Secrets\. Showing the last available data\./);
  assert.match(html, /Retry/);
  assert.match(html, /type="search"[^>]*value="Vault 7"/);
  assert.deepEqual(vaultLinks(html).map(([, slug]) => slug), ["vault-7"]);
  assert.equal((html.match(/<number-flow-react\b/g) ?? []).length, 3);
  assert.doesNotMatch(html, /Secrets unavailable|Loading Secrets overview|Create your first vault/);
});

test("all six preview rows are whole-row scoped links with a separate new-vault action", () => {
  const html = render({ orgSlug: "other-workspace" });
  const links = vaultLinks(html, "other-workspace");
  assert.equal(links.length, 6);
  assert.deepEqual(links.map(([, slug]) => slug), ["vault-7", "vault-6", "vault-5", "vault-4", "vault-3", "vault-2"]);
  for (const [row, slug] of links) {
    const index = Number(slug.at(-1));
    assert.match(row, /group grid min-h-\[76px\]/);
    assert.ok(row.includes(`>Vault ${index}</p>`));
    assert.ok(row.includes(`Application ${index}`));
    assert.match(row, /Production/);
    assert.match(row, /Secrets <\/span>/);
    assert.ok(row.includes(`>${12 + index}</span>`));
    assert.ok(row.includes(`dateTime="${inventory[index].updatedAt}"`));
    assert.doesNotMatch(row, /<button\b|<a\b[\s\S]*?<a\b/);
  }
  assert.match(html, /href="\/other-workspace\/secrets\/vaults"/);
  assert.match(html, /href="\/other-workspace\/secrets\/audit"/);
  assert.match(html, /Showing 6 of 8 vaults/);
  const create = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find(([button]) => button.includes("New vault"))?.[0] ?? "";
  assert.match(create, /aria-haspopup="dialog"/);
  assert.match(create, /tabindex="0"/);
  assert.doesNotMatch(create, /disabled/);
  assert.doesNotMatch(html, /href="\/acme\//);
});

test("search uses the complete catalog before limiting and includes environment names and slugs", () => {
  const hidden = project(0, {
    name: "Archive",
    description: "Settlement imports",
    environments: [environment(0, { name: "Preview-hidden-special", slug: "canary-west" })],
  });
  const catalog = { ...data, projects: [hidden, ...inventory.slice(1)] };
  assert.doesNotMatch(render({ data: catalog }), />Archive<\/p>/);
  for (const searchInput of [" archive ", "SETTLEMENT", "vault-0", "preview-hidden-special", "canary-west"]) {
    const html = render({ data: catalog, searchInput });
    assert.deepEqual(vaultLinks(html).map(([, slug]) => slug), ["vault-0"]);
    assert.match(html, />Archive<\/p>/);
    assert.doesNotMatch(html, /No matching vaults|Showing 6 of/);
  }
});

test("search preview counts reflect the full match set and controls stay labeled", () => {
  const html = render({ searchInput: "production" });
  assert.equal(vaultLinks(html).length, 6);
  assert.match(html, /Showing 6 of 8 matching vaults/);
  assert.match(html, /<label for="[^"]+">Search vaults<\/label>/);
  assert.match(html, /<label for="[^"]+">Sort vaults<\/label>/);
  assert.equal((html.match(/role="combobox"/g) ?? []).length, 1);
  assert.match(html, /placeholder="Find a vault or environment…"/);
  assert.match(html, /autoComplete="off"/);
});

test("recent sorting uses the newest valid environment change and name sorting is deterministic", () => {
  const timestamp = "2026-10-05T13:00:00Z";
  const fromEnvironment = project(0, {
    name: "Zulu",
    updatedAt: "2026-10-03T12:00:00Z",
    environments: [environment(0, { updatedAt: "invalid" }), environment(1, { updatedAt: timestamp })],
  });
  const fromVault = project(1, { name: "Beta", updatedAt: "2026-10-04T12:00:00Z" });
  const unknown = project(2, { name: "Alpha", updatedAt: "invalid", environments: [environment(2, { updatedAt: "invalid" })] });
  assert.equal(vaultUpdatedAt(fromEnvironment), timestamp);
  assert.equal(vaultUpdatedAt(unknown), null);
  assert.deepEqual(filterOverviewVaults([unknown, fromVault, fromEnvironment], "", "updated").map(({ name }) => name), ["Zulu", "Beta", "Alpha"]);
  assert.deepEqual(filterOverviewVaults([fromEnvironment, fromVault, unknown], "", "name").map(({ name }) => name), ["Alpha", "Beta", "Zulu"]);
  const rendered = render({ data: { ...data, projects: [unknown, fromVault, fromEnvironment] } });
  assert.deepEqual(vaultLinks(rendered).map(([, slug]) => slug), ["vault-0", "vault-1", "vault-2"]);
  assert.match(vaultLinks(rendered)[0][0], /dateTime="2026-10-05T13:00:00Z"/);
  assert.match(vaultLinks(rendered)[2][0], />Unknown<\/span>/);
  assert.doesNotMatch(vaultLinks(rendered)[2][0], /dateTime="invalid"/);

  const tied = [
    project(2, { id: "z", name: "Same", slug: "a", updatedAt: timestamp }),
    project(1, { id: "b", name: "Same", slug: "b", updatedAt: timestamp }),
    project(0, { id: "a", name: "Same", slug: "a", updatedAt: timestamp }),
  ];
  for (const sort of ["updated", "name"] as const) {
    assert.deepEqual(filterOverviewVaults(tied, "", sort).map(({ id }) => id), ["a", "z", "b"]);
  }
});

test("search normalization accepts only supported URL values and bounds long input", () => {
  for (const input of [null, undefined, 42, [], { search: 123, sort: ["name"] }, { sort: "updated" }, { sort: "Name" }, { search: "  ", sort: "invalid" }]) {
    assert.deepEqual(normalizeSecretsOverviewSearch(input), {});
  }
  const input = { search: "  Archive  ", sort: "name", unrelated: "private-value" };
  Object.freeze(input);
  assert.deepEqual(normalizeSecretsOverviewSearch(input), { search: "Archive", sort: "name" });
  assert.deepEqual(input, { search: "  Archive  ", sort: "name", unrelated: "private-value" });
  assert.deepEqual(normalizeSecretsOverviewSearch({ search: `  ${"x".repeat(260)}  `, sort: "name" }), { search: "x".repeat(200), sort: "name" });
  assert.deepEqual(normalizeSecretsOverviewSearch({ search: "", sort: "name" }), { sort: "name" });
});

test("filtering and sorting preserve the original catalog and nested environments", () => {
  const projects = [project(3), project(1), project(2), project(0)];
  const snapshot = JSON.stringify(projects);
  for (const item of projects) {
    item.environments.forEach(Object.freeze);
    Object.freeze(item.environments);
    Object.freeze(item);
  }
  Object.freeze(projects);
  const filtered = filterOverviewVaults(projects, "production", "name");
  assert.notEqual(filtered, projects);
  assert.deepEqual(filtered.map(({ id }) => id), ["project-0", "project-1", "project-2", "project-3"]);
  assert.equal(JSON.stringify(projects), snapshot);
  assert.equal(filtered[0], projects[3]);
});

test("vault rows preserve mobile metadata, keyboard focus and reduced-motion safeguards", () => {
  const html = render();
  for (const [row] of vaultLinks(html)) {
    assert.match(row, /grid-cols-\[minmax\(0,1fr\)_12px\]/);
    assert.match(row, /col-span-2 flex min-w-0 flex-wrap/);
    assert.match(row, /md:contents/);
    assert.match(row, /md:sr-only">Secrets /);
    assert.match(row, /focus-visible:outline-2/);
    assert.match(row, /motion-reduce:transition-none/);
    assert.doesNotMatch(row, /tabindex="-1"/);
  }
  const all = html.match(/<a\b[^>]*href="\/acme\/secrets\/vaults"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
  assert.match(all, /focus-visible:outline-2/);
  assert.match(all, /motion-reduce:transition-none/);
});

test("the overview shows only inventory counts and labels, not secret values or invented health and charts", () => {
  const unusualProject = Object.assign(project(0), { secretValues: ["private-vault-value"], token: "private-machine-token" });
  const html = render({ data: { ...data, projects: [unusualProject], recentActivity: [{
    id: "audit-1",
    action: "secret.updated",
    resourceType: "secret",
    resourceName: "API_KEY",
    actorType: "user",
    actorName: "Ada",
    createdAt: "2026-10-05T12:00:00Z",
    metadata: { value: "private-audit-value", oldValue: "private-prior-value" },
  }] } });
  const summary = html.match(/<section aria-label="Secrets summary"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.equal((summary.match(/<number-flow-react\b/g) ?? []).length, 3);
  assert.deepEqual(summaryValues(html), ["8", "16", "3,124"]);
  assert.match(summary, />Vaults<\/p>/);
  assert.match(summary, />Environments<\/p>/);
  assert.match(summary, />Stored secrets<\/p>/);
  assert.match(html, /API_KEY/);
  assert.doesNotMatch(html, /private-vault-value|private-machine-token|private-audit-value|private-prior-value/);
  assert.doesNotMatch(html, /recharts-|<canvas\b|data-usage-bar|Last 24 hours|Time range|Healthy|All secure|Encrypted at rest|Activity trend/);
});
