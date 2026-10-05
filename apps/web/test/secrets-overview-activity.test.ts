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
import { SecretsOverviewActivity } from "../src/components/secrets/overview-activity";
import type { SecretAuditEvent } from "../src/lib/secrets-client";

Object.assign(globalThis, { React });

function event(index: number, overrides: Partial<SecretAuditEvent> = {}): SecretAuditEvent {
  return {
    id: `event-${index}`,
    action: "secret.updated",
    resourceType: "secret",
    resourceId: `secret-${index}`,
    resourceName: `API_KEY_${index}`,
    projectName: "Payments",
    projectSlug: "payments",
    environmentName: "Production",
    environmentSlug: "production",
    actorType: "user",
    actorName: "Ada Lovelace",
    actorEmail: "ada@example.com",
    createdAt: `2026-10-05T12:0${index}:00Z`,
    ...overrides,
  };
}

function render(events: SecretAuditEvent[]) {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const rest = createRoute({ getParentRoute: () => org, path: "$" });
  const router = createRouter({
    routeTree: root.addChildren([org.addChildren([rest])]),
    history: createMemoryHistory({ initialEntries: ["/acme/secrets"] }),
  });
  return renderToStaticMarkup(React.createElement(RouterContextProvider, {
    router,
    children: React.createElement(SecretsOverviewActivity, { orgSlug: "acme", events }),
  }));
}

function rows(html: string) {
  return [...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(([row]) => row);
}

test("the overview keeps the six newest events without mutating the audit response", () => {
  const events = [event(1), event(6), event(0), event(4), event(7), event(3), event(5), event(2)];
  const originalIds = events.map(({ id }) => id);
  const html = render(events);
  const preview = rows(html);
  assert.equal(preview.length, 6);
  assert.deepEqual(preview.map((row) => row.match(/data-secret-audit-event="([^"]+)"/)?.[1]), [
    "event-7", "event-6", "event-5", "event-4", "event-3", "event-2",
  ]);
  assert.deepEqual(events.map(({ id }) => id), originalIds);
  assert.doesNotMatch(html, /API_KEY_0|API_KEY_1/);
});

test("activity preserves actors, vault and environment names, and full native timestamps", () => {
  const html = render([
    event(3),
    event(2, { action: "project.created", resourceType: "project", resourceName: "Payments" }),
    event(1, { actorType: "machine", actorName: null, actorEmail: null, actorId: "machine-id", metadata: { actorPrefix: "out_tok_123" } }),
    event(0, { actorType: "system", actorName: null, actorEmail: null }),
  ]);
  assert.match(html, /Ada Lovelace \(ada@example\.com\)/);
  assert.match(html, /vault created/);
  assert.doesNotMatch(html, /project created/);
  assert.match(html, /Machine token · out_tok_123/);
  assert.match(html, />System<\/span>/);
  assert.match(html, /Vault · Payments/);
  assert.match(html, /Environment · Production/);
  assert.match(html, /<time dateTime="2026-10-05T12:03:00Z" title="[^"]*2026-10-05T12:03:00Z/);
  assert.match(html, /aria-label="Recent secrets activity"/);
});

test("historical resources stay unlinked and metadata values never enter the preview", () => {
  const html = render([event(0, {
    action: "secret.deleted",
    metadata: {
      value: "top-secret-value",
      oldValue: "previous-secret-value",
      token: "complete-machine-credential",
      resourceUrl: "/acme/secrets/vaults/deleted-vault",
    },
  })]);
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map(([, href]) => href);
  assert.deepEqual(links, ["/acme/secrets/audit"]);
  assert.match(html, /API_KEY_0/);
  assert.doesNotMatch(html, /top-secret-value|previous-secret-value|complete-machine-credential|deleted-vault/);
  assert.doesNotMatch(html, /<button\b|role="button"|Healthy|All secure/);
});

test("the compact rows stack time on mobile and the audit link has visible keyboard focus", () => {
  const html = render([event(0)]);
  assert.match(html, /grid-cols-\[auto_minmax\(0,1fr\)\]/);
  assert.match(html, /sm:grid-cols-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(html, /col-start-2 whitespace-nowrap text-\[11px\]/);
  assert.match(html, /sm:col-auto/);
  assert.match(html, /break-words text-\[13px\] leading-5/);
  const link = html.match(/<a\b[^>]*href="\/acme\/secrets\/audit"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
  assert.match(link, /focus-visible:ring-2/);
  assert.match(link, /motion-reduce:transition-none/);
  assert.match(link, /Audit log/);
  assert.doesNotMatch(link, /tabindex="-1"/);
  assert.doesNotMatch(html, /rounded-2xl|rounded-xl/);
});

test("no recent activity is distinct from an empty vault inventory", () => {
  const html = render([]);
  assert.match(html, /No recent activity/);
  assert.match(html, /Vault changes and secret access will appear here/);
  assert.match(html, /href="\/acme\/secrets\/audit"/);
  assert.doesNotMatch(html, /<li\b|Create your first vault|Create vault|No vaults|Healthy|All secure/);
});

test("unknown timestamps sort last and do not pretend to be recent", () => {
  const html = render([event(0, { createdAt: "unknown" }), event(1)]);
  const preview = rows(html);
  assert.match(preview[0], /data-secret-audit-event="event-1"/);
  assert.match(preview[1], /<time title="Timestamp unavailable"/);
  assert.match(preview[1], />Unknown<\/time>/);
  assert.doesNotMatch(preview[1], /dateTime=|Just now/);
});
