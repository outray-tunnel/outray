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
import { CopyButton } from "../src/components/arc/copy-button/copy-button";
import { TabsContent } from "../src/components/arc/tabs/tabs";
import { TunnelHeader } from "../src/components/tunnel-details/tunnel-header";
import { TunnelTabs } from "../src/components/tunnel-details/tunnel-tabs";

Object.assign(globalThis, { React });

function renderTabs(activeTab: string, protocol = "http") {
  return renderToStaticMarkup(
    React.createElement(
      TunnelTabs,
      { activeTab, protocol, setActiveTab: () => {} },
      React.createElement(TabsContent, { value: "overview" }, "Overview content"),
      React.createElement(TabsContent, { value: "requests" }, "Activity content"),
    ),
  );
}

test("registry copy control has an accessible name without a success message at rest", () => {
  const html = renderToStaticMarkup(
    React.createElement(CopyButton, {
      value: "https://example.outray.app",
      label: "Copy tunnel URL",
      iconOnly: true,
      variant: "plain",
    }),
  );
  assert.match(html, /type="button"/);
  assert.match(html, /aria-label="Copy tunnel URL"/);
  assert.match(html, /data-copy-state="idle"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.doesNotMatch(html, /Tunnel URL copied/);
});

test("tunnel tabs link the active trigger and panel and mount only its content", () => {
  const html = renderTabs("overview");
  assert.match(html, /role="tablist"[^>]*aria-label="Tunnel views"/);
  assert.match(html, /role="tab" aria-selected="true"/);
  const panelId = html.match(/role="tabpanel"[^>]*id="([^"]+)"/)?.[1];
  assert.ok(panelId);
  assert.ok(html.includes(`aria-controls="${panelId}"`));
  assert.match(html, /Overview content/);
  assert.doesNotMatch(html, /Activity content/);
});

test("Requests and protocol Events retain the controlled activity tab", () => {
  const requests = renderTabs("requests");
  assert.match(requests, /Requests/);
  assert.match(requests, /Activity content/);
  assert.doesNotMatch(requests, /Overview content/);
  const events = renderTabs("requests", "tcp");
  assert.match(events, /Events/);
  assert.doesNotMatch(events, /Requests/);
  assert.match(events, /Activity content/);
});

test("tunnel header back navigation uses the route organization slug", () => {
  const root = createRootRoute();
  const org = createRoute({ getParentRoute: () => root, path: "$orgSlug" });
  const tunnels = createRoute({ getParentRoute: () => org, path: "tunnels" });
  const detail = createRoute({ getParentRoute: () => tunnels, path: "$tunnelId" });
  const router = createRouter({
    routeTree: root.addChildren([org.addChildren([tunnels.addChildren([detail])])]),
    history: createMemoryHistory({
      initialEntries: ["/stale-org/tunnels/tunnel-1"],
    }),
  });
  const html = renderToStaticMarkup(
    React.createElement(RouterContextProvider, {
      router,
      children: React.createElement(TunnelHeader, {
        orgSlug: "current-org",
        tunnel: {
          id: "tunnel-1",
          name: "API",
          isOnline: true,
          url: "https://api.example.com",
          protocol: "http",
        },
        onStop: async () => {},
        isStopping: false,
      }),
    }),
  );

  assert.match(html, /href="\/current-org\/tunnels"[^>]*>[^<]*<svg[^>]*>[\s\S]*?All tunnels/);
  assert.doesNotMatch(html, /href="\/stale-org\/tunnels"/);
});
