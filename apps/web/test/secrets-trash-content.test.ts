import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SecretsTrashContent } from "../src/components/secrets/trash-content";
import type { SecretTrashItem } from "../src/lib/secrets-client";

Object.assign(globalThis, { React });

type ContentProps = React.ComponentProps<typeof SecretsTrashContent>;

function item(id: string, overrides: Partial<SecretTrashItem> = {}): SecretTrashItem {
  return {
    id,
    batchId: `batch-${id}`,
    type: "secret",
    name: "DATABASE_URL",
    itemCount: 1,
    isProduction: false,
    deletedAt: "2026-10-06T09:00:00Z",
    expiresAt: null,
    metadata: { projectSlug: "payments", environmentSlug: "development" },
    ...overrides,
  };
}

const inventory = [
  item("secret"),
  item("vault", { type: "project", name: "Legacy billing", itemCount: 8, metadata: { projectSlug: "billing", environments: 2, secrets: 5 } }),
  item("environment", { type: "environment", name: "Production", itemCount: 3, isProduction: true, metadata: { projectSlug: "billing", environmentSlug: "production", secrets: 2 } }),
  item("delete", { type: "bulk", name: "3 secrets from Staging", itemCount: 3, metadata: { reason: "delete" } }),
  item("move", { type: "bulk", name: "4 secrets from Development", itemCount: 4, metadata: { reason: "move" } }),
];

function render(overrides: Partial<ContentProps> = {}) {
  const props: ContentProps = {
    items: inventory,
    loading: false,
    refreshing: false,
    error: null,
    permissionPending: false,
    canRestore: true,
    search: "",
    view: "all",
    notice: null,
    onDismissNotice: () => {},
    onSearchChange: () => {},
    onViewChange: () => {},
    onClearFilters: () => {},
    onChooseVaults: () => {},
    onRetry: () => {},
    onRestore: () => {},
    ...overrides,
  };
  return renderToStaticMarkup(React.createElement(SecretsTrashContent, props));
}

const rows = (html: string) => [...html.matchAll(/<(?:article|li|div)\b[^>]*data-trash-batch="([^"]+)"[^>]*>/g)].map(([, id]) => id);
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
const visibleText = (html: string) => html.replace(/<[^>]*>/g, "");
const restoreButtons = (html: string) => buttons(html).filter((button) => /^Restore(?: item| batch)?$/.test(visibleText(button).trim()));

test("empty Trash explains recoverable deletion and provides a next step to vaults", () => {
  const html = render({ items: [] });
  assert.match(visibleText(html), /Trash is empty|Nothing in Trash/i);
  assert.match(visibleText(html), /deleted secrets|deleted items/i);
  assert.match(visibleText(html), /restore|recover/i);
  assert.match(html, /Choose vaults|View vaults|Browse vaults/);
  assert.equal(rows(html).length, 0);
  assert.doesNotMatch(html, /No matching|Could not load|could not be loaded|type="search"/);
  assert.doesNotMatch(html, /Empty Trash|Permanently delete|Delete forever/);
});

test("initial loading uses layout-matched skeletons instead of empty copy or loading text-only UI", () => {
  const html = render({ items: undefined, loading: true });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Loading (?:Trash|deleted items)/i);
  assert.match(html, /motion-reduce:animate-none/);
  assert.equal(rows(html).length, 0);
  assert.doesNotMatch(html, /DATABASE_URL|Legacy billing|Trash is empty|Nothing in Trash|No matching/);
});

test("failed initial requests are distinct from empty history and show retry beside the failure", () => {
  const html = render({ items: undefined, error: "Test Trash request failed" });
  assert.match(html, /role="alert"/);
  assert.match(html, /Test Trash request failed/);
  assert.match(html, /Try again|Retry/);
  assert.equal(rows(html).length, 0);
  assert.doesNotMatch(html, /Trash is empty|Nothing in Trash|No matching|DATABASE_URL|Loading Trash/);
});

test("read-only members can see recovery metadata without being offered restore actions", () => {
  const html = render({ canRestore: false });
  assert.deepEqual(rows(html), inventory.map(({ batchId }) => batchId));
  assert.match(html, /DATABASE_URL/);
  assert.match(visibleText(html), /owner|admin/i);
  assert.equal(restoreButtons(html).length, 0);
  assert.match(html, /type="search"/);
  assert.doesNotMatch(html, /Permanently delete|Delete forever/);
});

test("pending permissions never expose restoration actions", () => {
  for (const canRestore of [false, true]) {
    assert.equal(restoreButtons(render({ permissionPending: true, canRestore })).length, 0);
  }
});

test("rows distinguish record kinds, child counts, production scope, and move recovery", () => {
  const html = render();
  assert.deepEqual(rows(html), inventory.map(({ batchId }) => batchId));
  const text = visibleText(html);
  for (const expected of ["Vault", "Environment", "Secret batch", "Moved secrets", "2 environments", "5 secrets", "2 secrets", "3 secrets", "4 secrets", "Production"]) {
    assert.ok(text.includes(expected), `Expected metadata: ${expected}`);
  }
  assert.match(text, /payments \/ development/);
  assert.match(text, /billing \/ production/);
  assert.match(text, /source.*destination|destination.*unchanged/i);
  assert.match(html, /<time\b[^>]*dateTime="2026-10-06T09:00:00Z"/);
  const restores = restoreButtons(html);
  assert.equal(restores.length, inventory.length);
  for (const button of restores) {
    assert.match(button, /class="button (?:primary|secondary|ghost) sm(?:\s|")/);
    assert.match(button, /aria-haspopup="dialog"/);
    assert.doesNotMatch(button, /class="button danger/);
  }
});

test("null recovery deadlines are not formatted as the Unix epoch or described as expired", () => {
  const html = render({ items: [item("no-expiry")] });
  assert.deepEqual(rows(html), ["batch-no-expiry"]);
  assert.equal(restoreButtons(html).length, 1);
  assert.doesNotMatch(visibleText(html), /1970|Invalid Date|Expired|0 days (?:left|remaining)|Expires today/i);
  assert.doesNotMatch(html, /dateTime="1970/);
  assert.doesNotMatch(html, /30 days|30-day|permanently deleted after/i);
});

test("type filters and search apply to the metadata rows while preserving the entered search", () => {
  const html = render({ search: "  BILLING  ", view: "environments" });
  assert.deepEqual(rows(html), ["batch-environment"]);
  assert.match(html, /type="search"[^>]*value=" {2}BILLING {2}"/);
  assert.match(visibleText(html), /All/);
  assert.match(visibleText(html), /Secrets/);
  assert.match(visibleText(html), /Environments/);
  assert.match(visibleText(html), /Vaults/);
  assert.doesNotMatch(html, /<select\b/);
  assert.doesNotMatch(html, /DATABASE_URL|Legacy billing|3 secrets from Staging|4 secrets from Development/);
});

test("filter misses show no results and reset actions rather than an empty Trash introduction", () => {
  for (const overrides of [
    { search: "not-a-deleted-record" },
    { items: [inventory[0]], view: "vaults" as const },
  ]) {
    const html = render(overrides);
    assert.match(visibleText(html), /No matching|No .* match|No vaults/i);
    assert.match(html, /Clear (?:filters|search)/);
    assert.match(html, /type="search"/);
    assert.equal(rows(html).length, 0);
    assert.doesNotMatch(html, /Trash is empty|Nothing in Trash|Test Trash request failed|Loading Trash/);
  }
});

test("background refresh retains recovery rows and search; refresh failure has inline retry", () => {
  const updating = render({ loading: true, refreshing: true, search: "  DATABASE  " });
  assert.deepEqual(rows(updating), ["batch-secret"]);
  assert.match(updating, /type="search"[^>]*value=" {2}DATABASE {2}"/);
  assert.match(visibleText(updating), /Updating|Refreshing/i);
  assert.doesNotMatch(updating, /Loading Trash|Trash is empty/);
  const failed = render({ search: "  DATABASE  ", error: "Test Trash refresh failed" });
  assert.deepEqual(rows(failed), ["batch-secret"]);
  assert.match(failed, /role="alert"/);
  assert.match(visibleText(failed), /could not refresh/i);
  assert.match(failed, /Retry|Try again/);
  assert.match(failed, /type="search"[^>]*value=" {2}DATABASE {2}"/);
  assert.doesNotMatch(failed, /Loading Trash|Trash is empty/);
});

test("supported labels are escaped, and unknown values or source identifiers never render", () => {
  const html = render({ items: [item("safe-record", {
    name: '<script>alert("name")</script>',
    metadata: {
      projectSlug: "<billing>",
      environmentSlug: "development",
      value: "never-render-this-plaintext",
      projectId: "never-render-this-project-id",
      environmentId: "never-render-this-environment-id",
      url: "https://example.invalid/#never-render-this-key",
    },
  })] });
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;billing&gt;/);
  assert.doesNotMatch(html, /<script\b|never-render-this-plaintext|never-render-this-project-id|never-render-this-environment-id|never-render-this-key|example\.invalid/);
});

test("success notices are announced without replacing Trash rows", () => {
  const html = render({ notice: "Secrets restored." });
  assert.match(html, /role="status"/);
  assert.match(html, /Secrets restored\./);
  assert.deepEqual(rows(html), inventory.map(({ batchId }) => batchId));
  assert.ok(buttons(html).some((button) => visibleText(button).trim() === "Dismiss" || /aria-label="Dismiss (?:message|notification|notice)"/.test(button)));
});
