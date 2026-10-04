import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TunnelOverview } from "../src/components/tunnel-details/tunnel-overview";
import { ProtocolOverview } from "../src/components/tunnel-details/protocol-overview";
import {
  formatBytes,
  formatDuration,
  formatPercent,
  selectOverviewMetric,
} from "../src/components/tunnel-details/tunnel-overview-format";

// The Node test runner's TSX transform uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

const common = {
  timeRange: "24h",
  setTimeRange: () => {},
  isLoading: false,
  chartData: [],
};

test("metric values retain useful units and avoid unbounded precision", () => {
  assert.equal(formatBytes(1_024), "1.0 KB");
  assert.equal(formatDuration(1_250), "1.3 s");
  assert.equal(formatPercent(0.125), "0.13%");
});

test("selecting a metric switches the chart field and falls back safely", () => {
  const metrics = [
    { id: "requests", chartKey: "requests" },
    { id: "bandwidth", chartKey: "bandwidth" },
  ];
  assert.equal(
    selectOverviewMetric(metrics, "bandwidth")?.chartKey,
    "bandwidth",
  );
  assert.equal(
    selectOverviewMetric(metrics, "not-a-metric")?.chartKey,
    "requests",
  );
});

test("an empty HTTP overview has selectable metrics and a distinct no-activity state", () => {
  const html = renderToStaticMarkup(
    React.createElement(TunnelOverview, {
      ...common,
      stats: {
        totalRequests: 0,
        avgDuration: 0,
        totalBandwidth: 0,
        errorRate: 0,
      },
      recentRequests: [],
    }),
  );

  assert.match(html, /No activity in this period/);
  assert.match(html, /No requests in this period/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Chart time range/);
  assert.match(html, /Tunnel analytics/);
  assert.match(html, /Analytics/);
  assert.doesNotMatch(html, /Export/);
  assert.ok(
    html.indexOf("Select a metric") <
      html.indexOf("No activity in this period"),
  );
});

test("a failed initial request is not shown as zero traffic", () => {
  const html = renderToStaticMarkup(
    React.createElement(TunnelOverview, {
      ...common,
      stats: null,
      error: "Failed to fetch stats",
      onRetry: () => {},
    }),
  );

  assert.match(html, /Overview could not be loaded/);
  assert.match(html, /Retry/);
  assert.doesNotMatch(html, /No activity in this period/);
});

test("initial loading uses a layout skeleton, not zeroed metrics", () => {
  const html = renderToStaticMarkup(
    React.createElement(TunnelOverview, {
      ...common,
      stats: null,
      isLoading: true,
    }),
  );

  assert.match(html, /Loading tunnel overview/);
  assert.doesNotMatch(html, /No activity in this period/);
});

test("a range change labels retained data with its original range", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProtocolOverview, {
      ...common,
      protocol: "udp",
      stats: {
        totalConnections: 0,
        uniqueConnections: 0,
        uniqueClients: 0,
        totalBytesIn: 0,
        totalBytesOut: 0,
        totalPackets: 0,
        totalCloses: 0,
        avgDurationMs: 0,
      },
      recentEvents: [],
      timeRange: "7d",
      dataRange: "24h",
      isPlaceholderData: true,
    }),
  );

  assert.match(html, /Last 24 hours/);
  assert.match(html, /Loading 7d/);
  assert.match(html, /No events in this period/);
});
