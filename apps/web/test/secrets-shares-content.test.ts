import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SecretsSharesContent } from "../src/components/secrets/shares-content";
import type { SecretShareRecord } from "../src/lib/secrets-client";

Object.assign(globalThis, { React });

const now = Date.parse("2026-10-07T09:00:00Z");
type ContentProps = React.ComponentProps<typeof SecretsSharesContent>;

function share(id: string, overrides: Partial<SecretShareRecord> = {}): SecretShareRecord {
  return {
    id,
    createdAt: "2026-10-06T09:00:00Z",
    expiresAt: "2026-10-14T09:00:00Z",
    maxViews: 10,
    views: 3,
    revokedAt: null,
    keyNames: ["DATABASE_URL", "API_KEY"],
    projectId: "project-1",
    environmentId: "environment-1",
    ...overrides,
  };
}

const inventory = [
  share("active-link"),
  share("revoked-link", { keyNames: ["PAYMENT_TOKEN"], revokedAt: "2026-10-06T12:00:00Z" }),
  share("expired-link", { keyNames: ["SMTP_PASSWORD"], expiresAt: "2026-10-06T09:00:00Z" }),
  share("exhausted-link", { keyNames: ["SERVICE_ACCOUNT_JSON"], views: 10 }),
];

function render(overrides: Partial<ContentProps> = {}) {
  const props: ContentProps = {
    shares: inventory,
    loading: false,
    refreshing: false,
    error: null,
    permissionPending: false,
    canManage: true,
    now,
    search: "",
    view: "all",
    onSearchChange: () => {},
    onViewChange: () => {},
    onClearFilters: () => {},
    onChooseSecrets: () => {},
    onRetry: () => {},
    onRevoke: () => {},
    notice: null,
    onDismissNotice: () => {},
    ...overrides,
  };
  return renderToStaticMarkup(React.createElement(SecretsSharesContent, props));
}

const rows = (html: string) => [...html.matchAll(/<(?:article|li|div)\b[^>]*data-secret-share="([^"]+)"[^>]*>/g)].map(([, id]) => id);
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(([button]) => button);
const visibleText = (html: string) => html.replace(/<[^>]*>/g, "");

test("empty shares explain sharing without adding an organization member and offer a clear next step", () => {
  const html = render({ shares: [] });
  assert.match(html, /Share secrets without inviting a member/);
  assert.match(visibleText(html), /without inviting (?:them|anyone) to your organization/i);
  assert.match(visibleText(html), /encrypted link/i);
  assert.match(html, /Choose secrets/);
  assert.equal(rows(html).length, 0);
  assert.doesNotMatch(html, /No matching shares|Could not load shares|Shares could not be loaded|type="search"/);
  const launchers = buttons(html).filter((button) => /Choose secrets|Share secrets/.test(button));
  assert.ok(launchers.length > 0);
  for (const button of launchers) {
    assert.match(button, /class="button (?:primary|secondary) md(?:\s|")/);
    assert.doesNotMatch(button, /disabled/);
  }
  assert.doesNotMatch(html, /<a\b[^>]*>[\s\S]*?<button\b/);
});

test("restricted members cannot see share metadata, search, or management actions", () => {
  // A disabled React Query stays pending without starting a request. That must
  // not leave a restricted member looking at a permanent loading skeleton.
  for (const overrides of [{}, { shares: undefined, loading: true }]) {
    const html = render({ canManage: false, ...overrides });
    assert.match(visibleText(html), /owner|admin/i);
    assert.match(visibleText(html), /create|manage|revoke/i);
    assert.equal(rows(html).length, 0);
    assert.doesNotMatch(html, /Loading shares|DATABASE_URL|API_KEY|PAYMENT_TOKEN|SMTP_PASSWORD|SERVICE_ACCOUNT_JSON|type="search"/);
    assert.equal(buttons(html).filter((button) => /Choose secrets|Revoke/.test(visibleText(button))).length, 0);
  }
});

test("pending permissions and first loading show matched skeletons, not empty or restricted states", () => {
  for (const overrides of [
    { shares: undefined, loading: true },
    { shares: inventory, permissionPending: true, canManage: false },
  ]) {
    const html = render(overrides);
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /Loading shares/i);
    assert.match(html, /motion-reduce:animate-none/);
    assert.equal(rows(html).length, 0);
    assert.doesNotMatch(html, /DATABASE_URL|API_KEY|No matching shares|Share secrets without inviting a member|managed by admins|Could not load shares/);
  }
});

test("a failed initial request is distinct from empty history and exposes retry", () => {
  const html = render({ shares: undefined, error: "Test share request failed" });
  assert.match(html, /role="alert"/);
  assert.match(html, /Test share request failed/);
  assert.match(html, /Try again|Retry/);
  assert.equal(rows(html).length, 0);
  assert.doesNotMatch(html, /Share secrets without inviting a member|No matching shares|DATABASE_URL|Loading shares/);
});

test("search misses and ended-filter misses show no results rather than the introductory empty state", () => {
  for (const overrides of [
    { search: "not-a-shared-key" },
    { shares: [inventory[0]], view: "ended" as const },
  ]) {
    const html = render(overrides);
    assert.match(html, /No matching shares|No shares match|No ended shares/i);
    assert.match(html, /Clear (?:filters|search)/);
    assert.equal(rows(html).length, 0);
    assert.match(html, /type="search"/);
    assert.doesNotMatch(html, /Share secrets without inviting a member|Could not load shares|Loading shares/);
  }
});

test("rows show supported states, key names, timestamps, and revoke only active links", () => {
  const html = render();
  assert.deepEqual(rows(html), inventory.map(({ id }) => id));
  for (const key of inventory.flatMap(({ keyNames }) => keyNames)) assert.ok(html.includes(key));
  assert.match(visibleText(html), /Active/);
  assert.match(visibleText(html), /Revoked/);
  assert.match(visibleText(html), /Expired/);
  assert.match(visibleText(html), /Used up|Exhausted/);
  assert.match(html, /<time\b[^>]*dateTime="2026-10-06T09:00:00Z"/);
  assert.match(html, /<time\b[^>]*dateTime="2026-10-14T09:00:00Z"/);
  const revokes = buttons(html).filter((button) => /^Revoke(?: share)?$/.test(visibleText(button).trim()));
  assert.equal(revokes.length, 1);
  assert.match(revokes[0], /class="button (?:danger|ghost) sm(?:\s|")/);
  assert.match(revokes[0], /aria-haspopup="dialog"/);
  assert.doesNotMatch(html, /<a\b|secrets\.outray\.dev\//);
  assert.equal(buttons(html).filter((button) => /^Open|^Copy/.test(visibleText(button).trim())).length, 0);
});

test("search and state filters apply to rows while preserving entered text", () => {
  const html = render({ search: "  Payment  ", view: "ended" });
  assert.deepEqual(rows(html), ["revoked-link"]);
  assert.match(html, /type="search"[^>]*value=" {2}Payment {2}"/);
  assert.match(html, /All|Active|Ended/);
  assert.doesNotMatch(html, /DATABASE_URL|SMTP_PASSWORD|SERVICE_ACCOUNT_JSON/);
});

test("the API's 200-record cap is disclosed without claiming complete history", () => {
  const html = render({ shares: Array.from({ length: 200 }, (_, index) => share(`share-${index}`)) });
  assert.equal(rows(html).length, 200);
  assert.match(html, /Latest 200/);
  assert.doesNotMatch(html, /Complete history|All historical shares|Full history/i);
});

test("key names are rendered as escaped metadata, never executable markup", () => {
  const html = render({ shares: [share("unsafe-names", { keyNames: ['<script>alert("secret")</script>', "API_KEY"] })] });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script\b|dangerouslySetInnerHTML/);
});

test("background refresh and failed refresh retain metadata and current filters", () => {
  const updating = render({ loading: true, refreshing: true, search: "  API  " });
  assert.deepEqual(rows(updating), ["active-link"]);
  assert.match(updating, /type="search"[^>]*value=" {2}API {2}"/);
  assert.match(updating, /Updating|Refreshing/i);
  assert.doesNotMatch(updating, /Loading shares|Share secrets without inviting a member/);
  const failed = render({ error: "Test refresh failed", search: "  API  " });
  assert.deepEqual(rows(failed), ["active-link"]);
  assert.match(failed, /role="alert"/);
  assert.match(visibleText(failed), /could not refresh/i);
  assert.match(failed, /Retry|Try again/);
  assert.match(failed, /type="search"[^>]*value=" {2}API {2}"/);
  assert.doesNotMatch(failed, /Loading shares|Share secrets without inviting a member/);
});

test("rendering never exposes unexpected plaintext, fragment keys, or source IDs", () => {
  const html = render({ shares: [{
    ...share("metadata-only"),
    value: "never-render-this-plaintext",
    url: "https://secrets.example/metadata-only#never-render-this-fragment",
    projectId: "never-render-this-project-id",
    environmentId: "never-render-this-environment-id",
  } as SecretShareRecord] });
  assert.match(html, /DATABASE_URL/);
  assert.doesNotMatch(html, /never-render-this-plaintext|never-render-this-fragment|never-render-this-project-id|never-render-this-environment-id|secrets\.example/);
});

test("action notices are announced without hiding existing shares", () => {
  const html = render({ notice: "Share access revoked." });
  assert.match(html, /role="status"/);
  assert.match(html, /Share access revoked\./);
  assert.deepEqual(rows(html), inventory.map(({ id }) => id));
  assert.ok(buttons(html).some((button) => visibleText(button).trim() === "Dismiss" || /aria-label="Dismiss (?:message|notification|notice)"/.test(button)));
});
