import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TunnelOverview } from "../src/components/tunnel-details/tunnel-overview";
import { ProtocolOverview } from "../src/components/tunnel-details/protocol-overview";
import { TunnelOverviewSkeleton, type TunnelOverviewShell } from "../src/components/tunnel-details/tunnel-overview-ui";
import * as tunnelData from "../src/components/tunnel-details/tunnel-overview-data";
import * as tunnelFormat from "../src/components/tunnel-details/tunnel-overview-format";
import * as tunnelRange from "../src/lib/tunnel-stats-range";
import {
  formatBytes,
  formatDuration,
  formatPercent,
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

const cards = (html: string) => [...html.matchAll(/<article\b[^>]*data-metric="([^"]+)"[^>]*>[\s\S]*?<\/article>/g)]
  .map(([html, key]) => ({ html, key, value: html.match(/data-usage-value="([^"]+)"/)?.[1] }));

test("an empty HTTP overview keeps compact cards without pretending missing averages are zero", () => {
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
  assert.match(html, /Chart time range/);
  assert.match(html, /Tunnel analytics/);
  assert.match(html, />Traffic</);
  assert.deepEqual(cards(html).map(({ key, value }) => [key, value]), [
    ["requests", "0"], ["duration", "—"], ["bandwidth", "0 B"], ["errors", "—"],
  ]);
  assert.doesNotMatch(html, /Export|Select a metric|Show Requests chart|h-\[390px\]|0\.00%/);
});

test("HTTP overview uses four independent shared mini charts and animated headline values", () => {
  const html = renderToStaticMarkup(React.createElement(TunnelOverview, {
    ...common,
    stats: { totalRequests: 1234, avgDuration: 1250, totalBandwidth: 2048, errorRate: 0 },
    chartData: [
      { time: "2026-10-05T10:00:00Z", requests: 20, duration: 900, bandwidth: 1024, errorRate: 0 },
      { time: "2026-10-05T11:00:00Z", requests: 0, duration: 0, bandwidth: 0, errorRate: 0 },
    ],
  }));
  const metrics = cards(html);
  assert.deepEqual(metrics.map(({ value }) => value), ["1,234", "1.3 s", "2.0 KB", "0.00%"]);
  for (const card of metrics) {
    assert.match(card.html, /h-\[180px\]/);
    assert.match(card.html, /<number-flow-react/);
    assert.match(card.html, /role="group" tabindex="0"/);
    assert.match(card.html, /by interval<\/caption>/);
  }
  assert.match(html, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.doesNotMatch(html, /Select a metric|h-\[310px\]|h-\[390px\]/);
});

test("TCP and UDP retain their own measured metrics rather than HTTP cards", () => {
  const stats = {
    totalConnections: 10, uniqueConnections: 10, uniqueClients: 3, totalBytesIn: 1024,
    totalBytesOut: 2048, totalPackets: 35, totalCloses: 2, avgDurationMs: 1500,
  };
  const render = (protocol: "tcp" | "udp") => cards(renderToStaticMarkup(React.createElement(ProtocolOverview, {
    ...common, protocol, stats, recentEvents: [],
  })));
  assert.deepEqual(render("tcp").map(({ key }) => key), ["connections", "clients", "bytes-in", "bytes-out", "duration", "packets"]);
  assert.deepEqual(render("udp").map(({ key }) => key), ["clients", "packets", "bytes-in", "bytes-out"]);
  assert.equal(render("tcp").find(({ key }) => key === "duration")?.value, "1.5 s");
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
  assert.match(html, /motion-reduce:animate-none/);
  assert.equal((html.match(/h-\[180px\]/g) ?? []).length, 4);
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

test("background refresh and failure retain all metrics without a loading cover", () => {
  const html = renderToStaticMarkup(React.createElement(TunnelOverview, {
    ...common, isPlaceholderData: true, error: "refresh failed", onRetry: () => {},
    stats: { totalRequests: 100, avgDuration: 250, totalBandwidth: 4096, errorRate: 2 },
  }));
  assert.equal(cards(html).length, 4);
  assert.match(html, /Could not refresh this overview/);
  assert.match(html, /Retry/);
  assert.doesNotMatch(html, /Loading tunnel overview|Overview could not be loaded|No activity in this period/);
});

test("protocol skeleton uses the same six-card responsive layout as its loaded overview", () => {
  const html = renderToStaticMarkup(React.createElement(TunnelOverviewSkeleton, { metricCount: 6 }));
  assert.equal((html.match(/h-\[180px\]/g) ?? []).length, 6);
  assert.match(html, /sm:grid-cols-2 xl:grid-cols-3/);
  assert.doesNotMatch(html, /h-\[390px\]/);
});

test("toolbar and activity actions dispatch while card inspection stays scoped to the loaded range", async () => {
  type ShellProps = React.ComponentProps<typeof TunnelOverviewShell>;
  const source = await readFile(new URL("../src/components/tunnel-details/tunnel-overview-ui.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const stub = (props: { children?: React.ReactNode }) => React.createElement("div", null, props.children);
  const stubs = { Button: stub, UsageMetricCard: () => null, SegmentedControl: () => null };
  const module = { exports: {} as { TunnelOverviewShell: (props: ShellProps) => React.ReactNode } };
  runInNewContext(compiled, {
    React, module, exports: module.exports,
    require: (specifier: string) => {
      if (specifier === "react") return { useMemo: (callback: () => unknown) => callback() };
      if (specifier === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (specifier === "./tunnel-overview-data") return tunnelData;
      if (specifier === "./tunnel-overview-format") return tunnelFormat;
      if (specifier === "@/lib/tunnel-stats-range") return tunnelRange;
      if (specifier.endsWith(".css")) return {};
      if (specifier.startsWith("@/components/") || specifier === "../ui/segmented-control") return stubs;
      throw new Error(`Unexpected shell dependency: ${specifier}`);
    },
  });
  function elements(node: React.ReactNode): React.ReactElement<Record<string, any>>[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<Record<string, any>>;
    return [element, ...elements(element.props.children)];
  }
  const calls: string[] = [];
  const props: ShellProps = {
    metrics: [{ id: "requests", label: "Requests", description: "Requests per interval", value: "10", numericValue: 10, chartKey: "requests", format: (value) => String(value) }],
    chartData: [{ time: "2026-10-05T10:00:00Z", requests: 10 }],
    hasActivity: true, timeRange: "7d", dataRange: "24h", isPlaceholderData: true,
    isLoading: false, setTimeRange: (range) => calls.push(range),
    onRetry: () => calls.push("retry"), onViewActivity: () => calls.push("activity"),
    activityTitle: "Recent requests", activityDescription: "Latest traffic", activity: null,
  };
  const tree = elements(module.exports.TunnelOverviewShell(props));
  const range = tree.find((element) => element.type === stubs.SegmentedControl)!;
  assert.equal(range.props.value, "7d");
  assert.deepEqual(Array.from(range.props.options, (option: any) => option.value), ["1h", "24h", "7d", "30d"]);
  range.props.onValueChange("30d");
  const card = tree.find((element) => element.type === stubs.UsageMetricCard)!;
  assert.equal(card.props.range, "24h");
  assert.equal(card.props.bars[0].value, 10);
  assert.equal(card.props.bars[0].endTime, "2026-10-05T11:00:00.000Z");
  tree.find((element) => element.type === stubs.Button)!.props.onClick();
  const failed = elements(module.exports.TunnelOverviewShell({ ...props, error: "stale" }));
  failed.find((element) => element.type === stubs.Button)!.props.onClick();
  assert.deepEqual(calls, ["30d", "activity", "retry"]);
});
