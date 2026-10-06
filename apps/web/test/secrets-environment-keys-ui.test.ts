import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import {
  EnvironmentKeysContent,
  type EnvironmentKeysContentProps,
} from "../src/components/secrets/environment-keys-content";
import { SecretsTable } from "../src/components/secrets/secrets-table";
import { VaultEnvironmentsFrame } from "../src/components/secrets/vault-environments-layout";
import type { SecretEnvironment, SecretMetadata, SecretProject } from "../src/lib/secrets-client";

Object.assign(globalThis, { React });

function environment(overrides: Partial<SecretEnvironment> = {}): SecretEnvironment {
  return {
    id: "env-development", slug: "development", name: "Development", description: "Local API settings",
    secretCount: 2, revision: 4, isProduction: false,
    createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-05T12:00:00Z",
    ...overrides,
  };
}

const environments = [
  environment(),
  environment({ id: "env-live", slug: "live", name: "Live", secretCount: 1234, revision: 9, isProduction: true }),
  environment({ id: "env-production", slug: "production", name: "Production", secretCount: 0, revision: 0 }),
];
const project: SecretProject = {
  id: "vault-api", slug: "backend", name: "Payments API", description: "Service credentials",
  environments, environmentCount: environments.length, secretCount: 1236,
  createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-05T12:00:00Z",
};
const secrets: SecretMetadata[] = [
  { id: "secret-db", key: "DATABASE_URL", version: 2, revision: 4, createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-05T12:00:00Z" },
  { id: "secret-api", key: "API_KEY", version: 1, revision: 4, createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-04T12:00:00Z" },
];
const data = { project, environment: environments[0], secrets, revision: 4 };

function render(overrides: Partial<EnvironmentKeysContentProps> = {}, sharedFrame = false) {
  const contentProps: EnvironmentKeysContentProps = {
    orgSlug: "acme", projectSlug: "backend", environmentSlug: "development", data,
    loading: false, refreshing: false, error: null, actionError: null, exporting: false,
    onImport: () => {}, onExport: () => {}, onAdd: () => {}, onRetry: () => {},
    ...overrides,
  };
  if (contentProps.data && contentProps.children === undefined) {
    contentProps.children = React.createElement(SecretsTable, {
      orgSlug: contentProps.orgSlug, projectSlug: contentProps.projectSlug,
      environment: contentProps.data.environment, environments: contentProps.data.project.environments,
      secrets: contentProps.data.secrets, revision: contentProps.data.revision,
      onMutated: () => {}, onAdd: contentProps.onAdd,
      contained: contentProps.sharedLayout, scrollRows: contentProps.sharedLayout,
    });
  }
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([org.addChildren([rest])]),
    history: createMemoryHistory({ initialEntries: [`/${encodeURIComponent(contentProps.orgSlug)}/secrets/vaults/${encodeURIComponent(contentProps.projectSlug)}/environments/${encodeURIComponent(contentProps.environmentSlug)}`] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const content = React.createElement(EnvironmentKeysContent, contentProps);
  return renderToStaticMarkup(React.createElement(QueryClientProvider, {
    client,
    children: React.createElement(RouterContextProvider, {
      router,
      children: sharedFrame ? React.createElement(VaultEnvironmentsFrame, {
        orgSlug: contentProps.orgSlug, projectSlug: contentProps.projectSlug, environmentSlug: contentProps.environmentSlug,
        project, loading: false, error: null, onRetry: () => {}, children: content,
      }) : content,
    }),
  }));
}

function environmentLinks(html: string) {
  return [...html.matchAll(/<a\b[^>]*href="[^"?]*\/secrets\/vaults\/[^"?]*\/environments\/[^"?]+"[^>]*>[\s\S]*?<\/a>/g)].map(([link]) => link);
}

function buttons(html: string) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
}

test("environment navigation uses full native links with one current page and Alerts-style underlines", () => {
  const html = render();
  const links = environmentLinks(html);
  assert.equal(links.length, environments.length);
  assert.deepEqual(links.map((link) => link.match(/href="([^"]+)"/)?.[1]), environments.map(({ slug }) => `/acme/secrets/vaults/backend/environments/${slug}`));
  assert.equal(links.filter((link) => link.includes('aria-current="page"')).length, 1);
  assert.match(links[0], /aria-current="page"/);
  assert.match(links[0], /Development/);
  assert.match(links[1], /Live/);
  assert.match(links[1], /1,234/);
  assert.match(links[2], /Production/);
  assert.match(links[0], /absolute inset-x-3 bottom-0 h-px bg-zinc-300/);
  assert.equal((html.match(/absolute inset-x-3 bottom-0 h-px bg-zinc-300/g) ?? []).length, 1);
  assert.match(links[1], /lucide-lock-keyhole text-amber-300\/75/);
  assert.match(links[1], /class="sr-only">Production environment<\/span>/);
  assert.match(links[1], /class="sr-only">1234 secrets<\/span>/);
  assert.doesNotMatch(links[2], /Production environment|text-amber|lucide-lock-keyhole/);
  for (const link of links) {
    assert.match(link, /focus-visible:outline-2/);
    assert.match(link, /motion-reduce:transition-none/);
    assert.doesNotMatch(link, /<button\b|<select\b|tabindex="-1"|aria-pressed|role="tab"/);
  }
  assert.match(html, /<nav aria-label="Switch environment" class="flex overflow-x-auto/);
  assert.doesNotMatch(html, /role="combobox"|<select\b|role="tablist"/);
});

test("environment links encode every scope segment and stay on the canonical vault route", () => {
  const orgSlug = "org & team";
  const projectSlug = "api/v2";
  const current = environment({ slug: "preview #1", name: "Preview <EU>" });
  const next = environment({ id: "env-next", slug: "stage/blue", name: "Stage & blue" });
  const html = render({ orgSlug, projectSlug, environmentSlug: current.slug, data: { ...data, project: { ...project, slug: projectSlug, environments: [current, next] }, environment: current } });
  const links = environmentLinks(html);
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((link) => link.match(/href="([^"]+)"/)?.[1]), [current, next].map(({ slug }) => `/${encodeURIComponent(orgSlug)}/secrets/vaults/${encodeURIComponent(projectSlug)}/environments/${encodeURIComponent(slug)}`));
  assert.match(links[0], /Preview &lt;EU&gt;/);
  assert.match(links[1], /Stage &amp; blue/);
  assert.doesNotMatch(html, /\/secrets\/projects\/|href="\/acme\//);
});

test("changing the environment selects exactly its destination and production is based on persisted metadata", () => {
  for (const current of environments) {
    const html = render({ environmentSlug: current.slug, data: { ...data, environment: current, revision: current.revision } });
    const links = environmentLinks(html);
    const selected = links.filter((link) => link.includes('aria-current="page"'));
    assert.equal(selected.length, 1);
    assert.ok(selected[0].includes(`/environments/${current.slug}"`));
    assert.match(selected[0], /absolute inset-x-3 bottom-0 h-px bg-zinc-300/);
    assert.ok(html.includes(`>${current.name}</h1>`));
    const exportAction = buttons(html).find((button) => button.includes("Export .env")) ?? "";
    if (current.isProduction) {
      assert.match(exportAction, /aria-haspopup="dialog"/);
      assert.match(selected[0], /Production environment/);
    } else {
      assert.doesNotMatch(exportAction, /aria-haspopup/);
      assert.doesNotMatch(selected[0], /Production environment|text-amber/);
    }
  }
});

test("loading and first-load errors do not invent environment links, metadata, or usable secret actions", () => {
  const loading = render({ data: null, loading: true });
  assert.match(loading, /aria-label="Loading environment secret keys" aria-busy="true"/);
  assert.equal((loading.match(/min-h-\[72px\]/g) ?? []).length, 5);
  assert.match(loading, /flex h-\[43px\] shrink-0 items-center justify-around/);
  assert.match(loading, /flex h-\[49px\] shrink-0 items-center/);
  assert.match(loading, /motion-reduce:animate-none/);
  assert.equal(environmentLinks(loading).length, 0);
  assert.doesNotMatch(loading, /DATABASE_URL|API_KEY|No secrets in this environment|role="combobox"|Import<|Export \.env|Add secret|Revision 0|0 secrets/);
  const failed = render({ data: null, error: "Environment load failed" });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Environment load failed/);
  assert.match(failed, /Try again/);
  assert.equal(environmentLinks(failed).length, 0);
  assert.match(failed, /Environment unavailable/);
  assert.doesNotMatch(failed, /DATABASE_URL|API_KEY|No secrets in this environment|Import<|Export \.env|Add secret/);
});

test("background refresh and failed refresh retain environment links and readable secret metadata", () => {
  const refreshing = render({ refreshing: true });
  assert.equal(environmentLinks(refreshing).length, environments.length);
  assert.match(refreshing, /Updating/);
  assert.match(refreshing, /DATABASE_URL/);
  const stale = render({ error: "Refresh failed", actionError: "Export could not be completed" });
  assert.match(stale, /role="alert"/);
  assert.match(stale, /Showing the last available/);
  assert.match(stale, /Export could not be completed/);
  assert.match(stale, /Retry/);
  assert.equal(environmentLinks(stale).length, environments.length);
  assert.match(stale, /DATABASE_URL/);
});

test("the environment header preserves add, import and export actions alongside compact revision metadata", () => {
  const html = render();
  assert.match(html, /<h1[^>]*>Development<\/h1>/);
  assert.match(html, /Payments API/);
  assert.match(html, /Revision 4|revision 4|r4/);
  for (const label of ["Import", "Export .env", "Add secret"]) {
    const action = buttons(html).find((button) => button.includes(label)) ?? "";
    assert.ok(action, `${label} remains available`);
    assert.match(action, /tabindex="0"/);
    assert.doesNotMatch(action, /disabled/);
  }
  const exporting = render({ exporting: true });
  const exportAction = buttons(exporting).find((button) => button.includes("Export .env")) ?? "";
  assert.match(exportAction, /aria-busy="true"/);
  assert.match(exportAction, /aria-disabled="true"/);
});

test("initial key rendering contains metadata only and a genuine empty environment remains actionable", () => {
  const decorated = Object.assign({ ...secrets[0] }, { value: "private-plaintext", ciphertext: "private-ciphertext", token: "private-token" });
  const html = render({ data: { ...data, secrets: [decorated, secrets[1]] } });
  assert.match(html, /DATABASE_URL/);
  assert.match(html, /API_KEY/);
  assert.doesNotMatch(html, /private-plaintext|private-ciphertext|private-token|Healthy|All secure|Encrypted at rest|recharts-|<canvas\b/);
  const emptyEnvironment = environment({ secretCount: 0, revision: 0 });
  const empty = render({ data: { ...data, environment: emptyEnvironment, secrets: [], revision: 0 } });
  assert.match(empty, /No secrets in this environment/);
  assert.match(empty, /Add first secret/);
  assert.equal(environmentLinks(empty).length, environments.length);
  assert.doesNotMatch(empty, /DATABASE_URL|API_KEY|Try again/);
});

test("the shared vault frame renders one fixed header and tabs with an unbroken bounded-height chain", () => {
  const html = render({ sharedLayout: true }, true);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.equal((html.match(/<nav\b/g) ?? []).length, 1);
  assert.equal(environmentLinks(html).length, environments.length);
  assert.match(html, /data-vault-environments-layout=""/);
  assert.match(html, /flex h-full min-h-0 w-full max-w-\[1440px\] flex-col gap-5 overflow-hidden/);
  assert.match(html, /aria-label="Environment secrets" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden/);
  assert.match(html, /<header class="shrink-0"/);
  assert.match(html, /aria-label="Switch environment" class="flex overflow-x-auto shrink-0/);
  assert.match(html, /aria-label="Secret key rows" tabindex="0"/);
  assert.equal((html.match(/overflow-y-auto/g) ?? []).length, 1);
  assert.match(html, /Secret keys/);
  assert.match(html, /DATABASE_URL/);
});

test("environment-specific content never duplicates shared chrome, including refresh, loading and errors", () => {
  for (const overrides of [
    {},
    { refreshing: true, error: "Could not refresh" },
    { data: null, loading: true },
    { data: null, loading: false, error: "Environment missing" },
  ]) {
    const html = render({ sharedLayout: true, ...overrides }, true);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.equal((html.match(/<nav\b/g) ?? []).length, 1);
    assert.equal(environmentLinks(html).length, environments.length);
    assert.match(html, /<h1[^>]*>Development<\/h1>/);
    assert.match(html, /flex min-h-0 flex-1 flex-col overflow-hidden/);
  }
  const loading = render({ sharedLayout: true, data: null, loading: true }, true);
  assert.match(loading, /Loading environment secret keys/);
  assert.match(loading, /min-h-0 flex-1 overflow-hidden/);
  assert.doesNotMatch(loading, /DATABASE_URL|Revision 0/);
  const failed = render({ sharedLayout: true, data: null, loading: false, error: "Environment missing" }, true);
  assert.match(failed, /Environment missing/);
  assert.match(failed, /Try again/);
});

test("each selected shared-frame environment preserves navigation and isolates its row scroll identity", () => {
  for (const current of environments) {
    const html = render({ sharedLayout: true, environmentSlug: current.slug, data: { ...data, environment: current, revision: current.revision } }, true);
    assert.match(html, new RegExp(`<h1[^>]*>${current.name}</h1>`));
    const selected = environmentLinks(html).filter((link) => link.includes('aria-current="page"'));
    assert.equal(selected.length, 1);
    assert.ok(selected[0].includes(`/environments/${current.slug}`));
    assert.ok(html.includes(`data-scroll-restoration-id="secrets-rows:acme:backend:${current.id}"`));
    assert.equal((html.match(/overflow-y-auto/g) ?? []).length, 1);
  }
});
