import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { formatBytes } from "../src/components/overview/format";
import {
  hoverUsageBarIndex,
  inspectedUsageBar,
  nextUsageBarIndex,
  type UsageBar,
} from "../src/components/overview/usage-bars";
import {
  UsageMetricCard,
  type Metric,
} from "../src/components/overview/tunnels-analytics";

// The Node test runner uses classic JSX; Vite uses automatic JSX.
Object.assign(globalThis, { React });

const requestBars: UsageBar[] = [
  { startTime: "2026-10-04T09:00:00.000Z", endTime: "2026-10-04T10:00:00.000Z", value: 0 },
  { startTime: "2026-10-04T10:00:00.000Z", endTime: "2026-10-04T11:00:00.000Z", value: 12 },
];
const bandwidthBars = requestBars.map((bar, index) => ({
  ...bar,
  value: index === 0 ? 512 : 1536,
}));
const requestMetric: Metric = {
  key: "httpRequests",
  label: "HTTP requests",
  description: "Completed web requests",
  value: 12,
  format: (value) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value),
};
const bandwidthMetric: Metric = {
  key: "bandwidth",
  label: "Data transfer",
  description: "Across all tunnels",
  value: 2048,
  format: formatBytes,
};

async function analyticsSource() {
  const source = await readFile(new URL("../src/components/overview/tunnels-analytics.tsx", import.meta.url), "utf8");
  return ts.createSourceFile("tunnels-analytics.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function functionNode(tree: ts.SourceFile, name: string) {
  const node = tree.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(node && ts.isFunctionDeclaration(node), `${name} remains available to inspect`);
  return node;
}

function openingElements(node: ts.Node) {
  const result: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
  function visit(child: ts.Node) {
    if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) result.push(child);
    ts.forEachChild(child, visit);
  }
  visit(node);
  return result;
}

function attribute(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  const prop = element.attributes.properties.find((candidate) =>
    ts.isJsxAttribute(candidate) && candidate.name.getText() === name);
  return prop && ts.isJsxAttribute(prop) ? prop.initializer : undefined;
}

function expression(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) {
  const value = attribute(element, name);
  assert.ok(value && ts.isJsxExpression(value) && value.expression, `${name} is explicitly wired`);
  return value.expression.getText().replace(/\s+/g, " ");
}

test("bar hover indices accept real zero/last indices and reject malformed or out-of-range inputs", () => {
  for (const [raw, expected] of [[0, 0], [1, 1], ["0", 0], ["1", 1], [" 1 ", 1]] as const) {
    assert.equal(hoverUsageBarIndex(raw, 2), expected);
  }
  for (const raw of [null, undefined, false, true, {}, [], "", " ", "bad", NaN, Infinity, -Infinity, -1, 2, 0.5, "0.5"]) {
    assert.equal(hoverUsageBarIndex(raw, 2), null, `invalid index ${String(raw)} is ignored`);
  }
  for (const count of [0, -1, 1.5, NaN, Infinity]) {
    assert.equal(hoverUsageBarIndex(0, count), null, "an invalid or empty series has no hover target");
  }
});

test("inspection prefers a valid hovered bar, including zero, then falls back to keyboard selection", () => {
  assert.equal(inspectedUsageBar(requestBars, requestBars, 0, 1), requestBars[0]);
  assert.equal(inspectedUsageBar(requestBars, requestBars, 0, 1)?.value, 0);
  assert.equal(inspectedUsageBar(requestBars, requestBars, 1, 0), requestBars[1]);
  assert.equal(inspectedUsageBar(requestBars, requestBars, null, 1), requestBars[1]);
  assert.equal(inspectedUsageBar(requestBars, requestBars, 2, 1), requestBars[1]);
  for (const [hover, keyboard] of [[null, null], [-1, -1], [2, 2], [NaN, Infinity]] as const) {
    assert.equal(inspectedUsageBar(requestBars, requestBars, hover, keyboard), null);
  }
  const empty: UsageBar[] = [];
  assert.equal(inspectedUsageBar(empty, empty, 0, 0), null);
});

test("replacement, shortened, or reordered data cannot reuse an inspection from the previous series", () => {
  for (const replacement of [
    requestBars.slice(),
    requestBars.map((bar) => ({ ...bar })),
    requestBars.slice(0, 1),
    requestBars.slice().reverse(),
    [],
  ]) {
    assert.equal(inspectedUsageBar(replacement, requestBars, 0, 1), null);
  }
  assert.equal(inspectedUsageBar(requestBars, requestBars, 1, null), requestBars[1],
    "an unchanged series keeps its meaningful current inspection");
});

test("keyboard inspection reaches a zero bar and Escape or a cleared selection restores the total", () => {
  let index: number | null = nextUsageBarIndex(null, "Home", requestBars.length) ?? null;
  assert.equal(index, 0);
  assert.equal(inspectedUsageBar(requestBars, requestBars, null, index)?.value ?? requestMetric.value, 0);
  index = nextUsageBarIndex(index, "ArrowRight", requestBars.length) ?? null;
  assert.equal(index, 1);
  assert.equal(inspectedUsageBar(requestBars, requestBars, null, index), requestBars[1]);
  index = nextUsageBarIndex(index, "Escape", requestBars.length) ?? null;
  assert.equal(index, null);
  assert.equal(inspectedUsageBar(requestBars, requestBars, null, index)?.value ?? requestMetric.value, 12);
  assert.equal(inspectedUsageBar(requestBars, requestBars, null, null)?.value ?? requestMetric.value, 12);
});

test("each metric selects its own raw interval value and resetting returns its formatted period total", () => {
  const requests = inspectedUsageBar(requestBars, requestBars, 0, null);
  const bandwidth = inspectedUsageBar(bandwidthBars, bandwidthBars, null, 1);
  assert.equal(requestMetric.format(requests?.value ?? requestMetric.value), "0");
  assert.equal(bandwidthMetric.format(bandwidth?.value ?? bandwidthMetric.value), "1.5 KB");
  assert.equal(bandwidthMetric.format(inspectedUsageBar(bandwidthBars, bandwidthBars, 0, null)?.value ?? bandwidthMetric.value), "512 B");
  assert.equal(requestMetric.format(inspectedUsageBar(requestBars, requestBars, null, null)?.value ?? requestMetric.value), "12");
  assert.equal(bandwidthMetric.format(bandwidth?.value ?? bandwidthMetric.value), "1.5 KB",
    "clearing another metric does not mutate the independently selected series");
  assert.equal(bandwidthMetric.format(inspectedUsageBar(bandwidthBars, bandwidthBars, null, null)?.value ?? bandwidthMetric.value), "2.0 KB");
});

test("metric cards server-render their own period total into the real ticker before any inspection", () => {
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(UsageMetricCard, { metric: requestMetric, range: "24h", bars: requestBars }),
    React.createElement(UsageMetricCard, { metric: bandwidthMetric, range: "24h", bars: bandwidthBars }),
  ));
  const cards = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(([card]) => card);
  assert.equal(cards.length, 2);
  for (const [index, value, description] of [[0, "12", requestMetric.description], [1, "2.0 KB", bandwidthMetric.description]] as const) {
    const headline = cards[index].match(/<p\b[^>]*data-usage-value="([^"]*)"[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(headline);
    assert.equal(headline[1], value);
    assert.equal((headline[2].match(/<number-flow-react\b/g) ?? []).length, 1);
    assert.ok(headline[2].includes(`aria-label="${value}"`));
    assert.ok(headline[2].includes(`<span>${value}</span>`), "the non-hydrated fallback is the supplied total");
    assert.ok(cards[index].includes(description));
  }
});

test("inspection state belongs to each card, rejects obsolete range/data, and drives headline and ticker together", async () => {
  const tree = await analyticsSource();
  const card = functionNode(tree, "UsageMetricCard");
  const source = card.getText(tree).replace(/\s+/g, " ");
  assert.match(source, /useState<[\s\S]*?\(\(\) => \(\{ bars, range, hoverIndex: null, keyboardIndex: null \}\)\)/);
  assert.match(source, /inspection\.bars === bars && inspection\.range === range/);
  assert.match(source, /const hoverIndex = isCurrent \? inspection\.hoverIndex : null/);
  assert.match(source, /const keyboardIndex = isCurrent \? inspection\.keyboardIndex : null/);
  assert.match(source, /const displayValue = activeBar\?\.value \?\? metric\.value/);
  assert.match(source, /const nextHoverIndex = kind === "hoverIndex" \? index : null/);
  assert.match(source, /const nextKeyboardIndex = kind === "keyboardIndex" \? index : null/);
  const elements = openingElements(card);
  const headline = elements.find((element) => attribute(element, "data-usage-value"));
  const ticker = elements.find((element) => element.tagName.getText(tree) === "UsageNumber");
  const chart = elements.find((element) => element.tagName.getText(tree) === "UsageMiniChart");
  assert.ok(headline && ticker && chart);
  assert.equal(expression(headline, "data-usage-value"), "metric.format(displayValue)");
  assert.equal(expression(ticker, "value"), "displayValue");
  assert.equal(expression(ticker, "metric"), "metric.key");
  assert.equal(expression(chart, "key"), "range");
  assert.equal(expression(chart, "hoverIndex"), "hoverIndex");
  assert.equal(expression(chart, "keyboardIndex"), "keyboardIndex");
  assert.equal(expression(chart, "onHoverIndexChange"), '(index) => inspect("hoverIndex", index)');
  assert.equal(expression(chart, "onKeyboardIndexChange"), '(index) => inspect("keyboardIndex", index)');
  assert.equal(expression(chart, "onResetInspection"), '() => inspect("hoverIndex", null)');
  const parent = functionNode(tree, "TunnelsAnalytics").getText(tree);
  assert.match(parent, /const series = useMemo\(/);
  assert.match(parent, /\[points, displayedRange, windowStart, windowEnd\]/,
    "refresh status alone does not replace series and discard an inspection");
});

test("actual bar hover, keyboard focus, leave, blur, and Escape are connected to the controlled inspection", async () => {
  const tree = await analyticsSource();
  const elements = openingElements(functionNode(tree, "UsageMiniChart"));
  const group = elements.find((element) => {
    const role = attribute(element, "role");
    return role && ts.isStringLiteral(role) && role.text === "group";
  });
  const bar = elements.find((element) => element.tagName.getText(tree) === "Bar");
  const tooltip = elements.find((element) => element.tagName.getText(tree) === "Tooltip");
  const chart = elements.find((element) => element.tagName.getText(tree) === "BarChart");
  assert.ok(group && bar && tooltip && chart);
  for (const event of ["onMouseEnter", "onMouseMove"]) {
    assert.match(expression(bar, event), /onHoverIndexChange\(hoverUsageBarIndex\(index, bars\.length\)\)/);
  }
  assert.equal(expression(bar, "onMouseLeave"), "onResetInspection");
  assert.equal(expression(tooltip, "shared"), "false", "blank chart space is not a shared bar hover target");
  assert.equal(attribute(chart, "onMouseMove"), undefined, "the headline responds to actual bar shapes, not chart-wide motion");
  assert.equal(expression(group, "onMouseLeave"), "onResetInspection");
  assert.equal(expression(group, "onPointerLeave"), "onResetInspection");
  assert.match(expression(group, "onBlur"), /pointerFocus\.current = false; onResetInspection\(\)/);
  assert.match(expression(group, "onFocus"), /if \(!pointerFocus\.current\) onKeyboardIndexChange\(bars\.length - 1\)/);
  assert.doesNotMatch(expression(group, "onPointerDown"), /onKeyboardIndexChange|onHoverIndexChange|onResetInspection/,
    "clicking a hovered bar does not reset its value while the pointer remains over it");
  const keyboard = expression(group, "onKeyDown");
  assert.match(keyboard, /nextUsageBarIndex\(keyboardIndex, event\.key, bars\.length\)/);
  assert.match(keyboard, /if \(next === undefined\) return; event\.preventDefault\(\)/);
  assert.match(keyboard, /onKeyboardIndexChange\(next\)/);
  assert.equal(nextUsageBarIndex(1, "Escape", requestBars.length), null);
  assert.equal(expression(bar, "isAnimationActive"), "!reducedMotion");
});
