import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TunnelsAnalytics } from "../src/components/overview/tunnels-analytics";
import { OverviewHeader } from "../src/components/overview/overview-header";

// The Node test runner's TSX transform uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

test("Tunnels overview presents truthful selectable metrics without export", () => {
  const html = renderToStaticMarkup(
    React.createElement(TunnelsAnalytics, {
      range: "24h",
      onRangeChange: () => {},
      stats: {
        httpRequests: 42,
        protocolEvents: 7,
        errors: 3,
        totalDataTransfer: 2048,
        activeTunnels: 2,
        chartData: [],
      },
    }),
  );

  assert.match(html, /All tunnels/);
  assert.match(html, /42/);
  assert.match(html, /HTTP requests/);
  assert.match(html, /Protocol events/);
  assert.match(html, /Data transfer/);
  assert.match(html, /HTTP errors/);
  assert.match(html, /2 online/);
  assert.match(html, /aria-label="Analytics time range"/);
  const rangeButtons = [
    ...html.matchAll(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>[\s\S]*?<\/button>/g),
  ].slice(0, 4);
  assert.equal(rangeButtons.length, 4);
  assert.equal(
    rangeButtons.filter(([button]) => button.includes('aria-pressed="true"'))
      .length,
    1,
  );
  assert.match(rangeButtons[1][0], /aria-pressed="true"/);
  assert.match(rangeButtons[1][0], /aria-hidden="true"/);
  assert.match(rangeButtons[1][0], /24h/);
  assert.match(html, /No activity in this period/);
  assert.doesNotMatch(html, /Export/);
});

test("Tunnels overview shows a retry state instead of zeroes on initial failure", () => {
  const html = renderToStaticMarkup(
    React.createElement(TunnelsAnalytics, {
      range: "24h",
      onRangeChange: () => {},
      error: "Failed to fetch stats",
      onRetry: () => {},
    }),
  );

  assert.match(html, /Analytics unavailable/);
  assert.match(html, /Try again/);
  assert.doesNotMatch(html, /No activity in this period/);
});

test("the new-tunnel action remains usable when the plan limit is reached", () => {
  const html = renderToStaticMarkup(
    React.createElement(OverviewHeader, {
      isAtLimit: true,
      onNewTunnelClick: () => {},
    }),
  );

  assert.match(html, /New tunnel \(plan limit reached\)/);
  assert.doesNotMatch(html, /disabled=""/);
});
