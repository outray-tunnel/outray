import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TunnelsAnalytics,
  type OverviewRange,
  type TunnelsOverviewStats,
} from "../src/components/overview/tunnels-analytics";
import { OverviewHeader } from "../src/components/overview/overview-header";
import { nextUsageBarIndex } from "../src/components/overview/usage-bars";

// The Node test runner's TSX transform uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

const stats: TunnelsOverviewStats = {
  httpRequests: 42,
  protocolEvents: 7,
  errors: 3,
  totalDataTransfer: 2048,
  activeTunnels: 2,
  timeRange: "24h",
  chartData: [
    {
      time: "2026-10-04T09:00:00.000Z",
      httpRequests: 7,
      protocolEvents: 2,
      bandwidth: 1024,
      errors: 1,
    },
    {
      time: "2026-10-04T10:00:00.000Z",
      httpRequests: 35,
      protocolEvents: 5,
      bandwidth: 1024,
      errors: 2,
    },
  ],
};

function render(props: Partial<React.ComponentProps<typeof TunnelsAnalytics>> = {}) {
  return renderToStaticMarkup(React.createElement(TunnelsAnalytics, {
    range: "24h",
    onRangeChange: () => {},
    stats,
    ...props,
  }));
}

function rangeButtons(html: string) {
  return [...html.matchAll(/<button[^>]*aria-pressed="(?:true|false)"[^>]*>[\s\S]*?<\/button>/g)]
    .map(([button]) => button);
}

function buttonLabel(button: string) {
  return button.replace(/<[^>]*>/g, "").trim();
}

function metricCards(html: string) {
  return [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)]
    .map(([article]) => article);
}

function summaryValues(html: string) {
  return metricCards(html).map((card) =>
    card.match(/<p\b[^>]*data-usage-value="([^"]*)"/)?.[1]);
}

function usageTitleRow(html: string) {
  return html.match(/<h2\b[^>]*>Usage<\/h2>[\s\S]*?<\/div>/)?.[0] ?? "";
}

const expectedMetrics = [
  { key: "httpRequests", label: "HTTP requests", value: "42", intervals: ["7", "35"] },
  { key: "protocolEvents", label: "Protocol events", value: "7", intervals: ["2", "5"] },
  { key: "bandwidth", label: "Data transfer", value: "2.0 KB", intervals: ["1.0 KB", "1.0 KB"] },
];

test("Tunnels overview presents three truthful non-selectable metrics without Errors, export, or a large chart", () => {
  const html = render();

  assert.match(html, />Usage<\/h2>/);
  assert.doesNotMatch(html, /All tunnels|>Last 24 hours</);
  assert.doesNotMatch(usageTitleRow(html), /role="status"/);
  const cards = metricCards(html);
  assert.equal(cards.length, 3);
  for (const [index, metric] of expectedMetrics.entries()) {
    const card = cards[index];
    assert.ok(card.includes(`aria-label="${metric.label}"`));
    assert.ok(card.includes(`data-metric="${metric.key}"`));
    const headline = card.match(/<p\b[^>]*data-usage-value="([^"]*)"[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(headline, `${metric.label} exposes its precise formatted summary`);
    assert.equal(headline[1], metric.value, `${metric.label} keeps its own summary value`);
    assert.match(headline[2], /<number-flow-react\b/);
    assert.ok(headline[2].includes(`aria-label="${metric.value}"`),
      "the real ticker exposes the same accessible initial value");
    assert.doesNotMatch(card, /<button|aria-pressed|role="(?:button|radio)"/);
  }
  assert.match(html, /2 online/);
  assert.match(html, /grid-cols-1 gap-3 md:grid-cols-3/);
  assert.doesNotMatch(html, /HTTP errors|data-metric="errors"|4xx and 5xx responses/);
  assert.match(html, /aria-label="Analytics time range"/);
  const buttons = rangeButtons(html);
  assert.equal(buttons.length, 4, "only range controls are selectable, not metric cards");
  assert.equal(
    buttons.filter((button) => button.includes('aria-pressed="true"'))
      .length,
    1,
  );
  assert.match(buttons[1], /aria-pressed="true"/);
  assert.equal(buttonLabel(buttons[1]), "24h");
  assert.doesNotMatch(html, /Select a chart metric|Show HTTP requests chart|Export/);
  assert.equal((html.match(/role="group" tabindex="0"/g) ?? []).length, 3,
    "each card has one mini chart, with no separate large selectable chart");
});

test("each active mini chart is a named keyboard stop with a meaningful interval table", () => {
  const cards = metricCards(render());
  for (const [index, metric] of expectedMetrics.entries()) {
    const card = cards[index];
    const chart = card.match(/<div\b[^>]*role="group"[^>]*>/)?.[0];
    assert.ok(chart, `${metric.label} exposes an inspectable chart`);
    assert.match(chart, /tabindex="0"/);
    assert.ok(chart.includes(`aria-label="${metric.label} over last 24 hours"`));
    const hintId = chart.match(/aria-describedby="([^"]+)"/)?.[1];
    assert.ok(hintId);
    assert.ok(card.includes(`id="${hintId}"`), "the chart references its own keyboard instructions");
    assert.match(card, /Use Left and Right arrow keys to inspect each bar/);
    assert.match(card, /Home and End jump to the first and last interval/);
    assert.match(card, /aria-live="polite"/);
    assert.ok(card.includes(`<caption>${metric.label} by interval</caption>`));
    assert.match(card, /<th scope="col">Interval<\/th>/);
    const body = card.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
      .map(([, row]) => [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, value]) => value));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(([, value]) => value), metric.intervals,
      `${metric.label} interval values agree with its metric rather than another card`);
    for (const [rowIndex, [interval]] of rows.entries()) {
      const start = new Date(stats.chartData[rowIndex].time);
      assert.ok(interval.includes(start.toLocaleDateString(undefined, { month: "short", day: "numeric" })));
      assert.ok(interval.includes(start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })));
    }
  }
});

test("mini chart keyboard navigation inspects adjacent and edge intervals without leaving the series", () => {
  assert.equal(nextUsageBarIndex(null, "ArrowLeft", 14), 12);
  assert.equal(nextUsageBarIndex(null, "ArrowRight", 14), 13);
  assert.equal(nextUsageBarIndex(7, "ArrowLeft", 14), 6);
  assert.equal(nextUsageBarIndex(7, "ArrowRight", 14), 8);
  assert.equal(nextUsageBarIndex(7, "Home", 14), 0);
  assert.equal(nextUsageBarIndex(7, "End", 14), 13);
  assert.equal(nextUsageBarIndex(0, "ArrowLeft", 14), 0);
  assert.equal(nextUsageBarIndex(13, "ArrowRight", 14), 13);
  for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
    assert.equal(nextUsageBarIndex(null, key, 1), 0);
    assert.equal(nextUsageBarIndex(null, key, 0), null);
  }
});

test("Escape dismisses the keyboard tooltip while unrelated keys keep their native behavior", () => {
  assert.equal(nextUsageBarIndex(7, "Escape", 14), null);
  assert.equal(nextUsageBarIndex(null, "Escape", 14), null);
  for (const key of ["Tab", "Enter", " ", "ArrowUp", "ArrowDown"]) {
    assert.equal(nextUsageBarIndex(7, key, 14), undefined);
  }
});

test("the same four time ranges remain labeled with one selected keyboard stop", () => {
  for (const range of ["1h", "24h", "7d", "30d"] satisfies OverviewRange[]) {
    const buttons = rangeButtons(render({ range, stats: { ...stats, timeRange: range } }));
    assert.equal(buttons.length, 4);
    assert.equal(buttons.filter((button) => button.includes('aria-pressed="true"')).length, 1);
    const selected = buttons.find((button) => button.includes('aria-pressed="true"'))!;
    assert.equal(buttonLabel(selected), range);
    assert.match(selected, /tabindex="0"/);
    assert.equal(buttons.filter((button) => button.includes('tabindex="-1"')).length, 3);
  }
});

test("empty overview activity remains explicit while online tunnels can still exist", () => {
  const html = render({
    stats: {
      ...stats,
      httpRequests: 0,
      protocolEvents: 0,
      errors: 0,
      totalDataTransfer: 0,
      chartData: [],
    },
  });
  assert.equal((html.match(/No activity in this period/g) ?? []).length, 3);
  assert.deepEqual(summaryValues(html), ["0", "0", "0 B"]);
  for (const [index, metric] of expectedMetrics.entries()) {
    const card = metricCards(html)[index];
    assert.ok(card.includes(`aria-label="${metric.label}: no activity in this period"`));
    assert.doesNotMatch(card, /role="group"|tabindex="0"|<table/);
  }
  assert.match(html, /2 online/);
  assert.doesNotMatch(html, /Analytics unavailable|Try again/);
});

test("zero-valued intervals do not create artificial activity or empty chart keyboard stops", () => {
  const html = render({
    stats: {
      ...stats,
      chartData: stats.chartData.map((point) => ({
        ...point,
        httpRequests: 0,
        protocolEvents: 0,
        bandwidth: 0,
        errors: 0,
      })),
    },
  });
  assert.equal(metricCards(html).length, 3);
  assert.equal((html.match(/No activity in this period/g) ?? []).length, 3);
  assert.doesNotMatch(html, /role="group" tabindex="0"|by interval<\/caption>/);
});

test("unknown and known-zero online counts stay distinct", () => {
  const unknown = render({ stats: { ...stats, activeTunnels: null } });
  assert.match(unknown, /— online/);
  assert.doesNotMatch(unknown, /0 online/);
  const zero = render({ stats: { ...stats, activeTunnels: 0 } });
  assert.match(zero, /0 online/);
  assert.doesNotMatch(zero, /— online/);
});

test("background refresh keeps compact metric values visible with a quiet updating status", () => {
  const html = render({ isFetching: true });
  assert.deepEqual(summaryValues(html), expectedMetrics.map((metric) => metric.value));
  assert.match(usageTitleRow(html), /<span\b[^>]*role="status"[^>]*>Updating<\/span>/);
  assert.doesNotMatch(html, /All tunnels|>Last 24 hours</);
  assert.doesNotMatch(html, /Analytics unavailable|No activity in this period/);
});

test("a range switch identifies retained metrics by their original range while loading the requested range", () => {
  const html = render({ range: "7d", isFetching: true });
  assert.match(usageTitleRow(html), /<span\b[^>]*role="status"[^>]*>Loading last 7 days<\/span>/i);
  assert.doesNotMatch(html, /All tunnels|>Last 24 hours</);
  assert.deepEqual(summaryValues(html), expectedMetrics.map((metric) => metric.value));
  for (const metric of expectedMetrics) {
    assert.ok(html.includes(`aria-label="${metric.label} over last 24 hours"`));
    assert.ok(!html.includes(`aria-label="${metric.label} over last 7 days"`));
  }
  const selected = rangeButtons(html).find((button) => button.includes('aria-pressed="true"'))!;
  assert.equal(buttonLabel(selected), "7d");
  assert.doesNotMatch(html, /Analytics unavailable|No activity in this period/);
});

test("a refresh error keeps the last available compact metrics and offers retry", () => {
  const html = render({ error: "Failed to fetch stats", onRetry: () => {} });
  assert.match(html, /role="alert"/);
  assert.match(html, /Could not refresh analytics/);
  assert.match(html, /Showing the last available data/);
  assert.deepEqual(summaryValues(html), expectedMetrics.map((metric) => metric.value));
  assert.match(html, /Retry/);
  assert.doesNotMatch(html, /Analytics unavailable|No activity in this period/);
});

test("a failed range switch still identifies retained values by their loaded range", () => {
  const html = render({
    range: "7d",
    error: "Failed to fetch stats",
    isFetching: false,
    onRetry: () => {},
  });
  assert.doesNotMatch(html, /All tunnels|>Last 24 hours</);
  for (const metric of expectedMetrics) {
    assert.ok(html.includes(`aria-label="${metric.label} over last 24 hours"`));
    assert.ok(!html.includes(`aria-label="${metric.label} over last 7 days"`));
  }
  assert.match(html, /Showing the last available data/);
  assert.deepEqual(summaryValues(html), expectedMetrics.map((metric) => metric.value));
  assert.doesNotMatch(html, /Loading last 7 days|Updating/i);
  const selected = rangeButtons(html).find((button) => button.includes('aria-pressed="true"'))!;
  assert.equal(buttonLabel(selected), "7d");
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
  assert.doesNotMatch(html, /HTTP requests|Protocol events|Data transfer|HTTP errors/);
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
