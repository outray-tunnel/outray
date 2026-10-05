import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { MetricChartReadout, MetricsChart } from "../src/components/observability/metrics-chart";
import { buildMetricChartSeries, metricChartInspectionIndex, metricChartValueDomain } from "../src/components/observability/metrics-data";
import * as metricsData from "../src/components/observability/metrics-data";
import type { MetricPoint } from "../src/components/observability/metrics-data";

Object.assign(globalThis, { React });
const point = (minute: number, value: number, overrides: Partial<MetricPoint> = {}): MetricPoint => ({
  timestamp: new Date(Date.UTC(2026, 9, 5, 12, minute)).toISOString(),
  type: "gauge", value, sampleCount: 1, aggregation: "latest", ...overrides,
});

test("chart preparation preserves genuine zero and negative gauges, real UTC times and ordering", () => {
  const points = [point(2, -5), point(0, 0), point(1, 10), point(3, NaN), { ...point(4, 999), timestamp: "invalid" }];
  const result = buildMetricChartSeries(points, "1h");
  assert.deepEqual(result.observations.map((item) => item.value), [0, 10, -5]);
  assert.deepEqual(result.data.map((item) => item.value), [0, 10, -5]);
  assert.equal(result.data[0].time, Date.UTC(2026, 9, 5, 12));
  assert.deepEqual(points.map((item) => item.value), [-5, 0, 10, NaN, 999], "input is not mutated");
  const domain = metricChartValueDomain(result.data);
  assert.ok(domain[0] < -5 && domain[1] > 10);
});

test("missing buckets break the line without zeroes, invented samples, or an inspectable fake point", () => {
  const result = buildMetricChartSeries([point(0, 2), point(4, 5)], "1h");
  assert.equal(result.observations.length, 2);
  assert.deepEqual(result.data.map((item) => item.value), [2, null, 5]);
  assert.equal(result.data[1].pointIndex, null);
  assert.equal(result.data[1].time, Date.UTC(2026, 9, 5, 12, 1));
  assert.deepEqual(buildMetricChartSeries([point(0, 2), point(5, 5)], "6h").data.map((item) => item.value), [2, 5]);
});

test("histogram means and counts are never joined on the same numerical scale", () => {
  const result = buildMetricChartSeries([
    point(0, 500, { aggregation: "mean" }), point(1, 20, { aggregation: "count" }),
    point(2, 700, { aggregation: "mean" }),
  ], "1h");
  assert.equal(result.aggregation, "mean");
  assert.deepEqual(result.data.map((item) => item.value), [500, null, 700]);
  assert.deepEqual(result.excludedAggregations, ["count"]);
  assert.equal(result.observations[1].value, 20, "other scale remains available for inspection");
  const countLast = buildMetricChartSeries([point(0, 500, { aggregation: "mean" }), point(1, 20, { aggregation: "count" })], "1h");
  assert.deepEqual(countLast.data.map((item) => item.value), [null, 20]);
  assert.equal(metricsData.metricValueUnit("ms", countLast.aggregation), "observations");
});

test("chart keyboard inspection is bounded, skips manufactured gap markers and can clear without closing the page", () => {
  assert.equal(metricChartInspectionIndex(null, "ArrowLeft", 3), 2);
  assert.equal(metricChartInspectionIndex(null, "ArrowRight", 3), 0);
  assert.equal(metricChartInspectionIndex(0, "ArrowLeft", 3), 0);
  assert.equal(metricChartInspectionIndex(2, "ArrowRight", 3), 2);
  assert.equal(metricChartInspectionIndex(2, "Home", 3), 0);
  assert.equal(metricChartInspectionIndex(0, "End", 3), 2);
  assert.equal(metricChartInspectionIndex(1, "Escape", 3), null);
  assert.equal(metricChartInspectionIndex(1, "Tab", 3), undefined);
  assert.equal(metricChartInspectionIndex(null, "Home", 0), undefined);
});

test("readout presents actual timestamp, aggregation, units and sample count without treating unknowns as zero", () => {
  const html = renderToStaticMarkup(React.createElement(MetricChartReadout, {
    point: point(0, 1250, { aggregation: "mean", sampleCount: 7 }), unit: "ms", plottedAggregation: "mean",
  }));
  assert.match(html, /dateTime="2026-10-05T12:00:00\.000Z"/i);
  assert.ok(html.includes(metricsData.formatMetricValue(1250, "ms")));
  assert.match(html, /7 samples · Mean/);
  const count = renderToStaticMarkup(React.createElement(MetricChartReadout, {
    point: point(0, 20, { aggregation: "count", sampleCount: 1 }), unit: "ms", plottedAggregation: "mean",
  }));
  assert.match(count, /20 observations/);
  assert.match(count, /1 sample · Observations/);
  assert.match(count, /Not plotted on this scale/);
  assert.doesNotMatch(count, /20 ms/);
  for (const sampleCount of [NaN, -1, 1.5]) {
    const unavailable = renderToStaticMarkup(React.createElement(MetricChartReadout, {
      point: point(0, 0, { sampleCount }), unit: "", plottedAggregation: "latest",
    }));
    assert.match(unavailable, /Sample count unavailable/);
    assert.doesNotMatch(unavailable, /NaN|— samples|0 samples/);
  }
});

test("chart is compact, supports SSR and empty evidence, and exposes one keyboard surface rather than hundreds of buttons", () => {
  const html = renderToStaticMarkup(React.createElement(MetricsChart, {
    points: [point(0, -3)], unit: "°C", range: "1h", metricName: "temperature<script>",
  }));
  assert.match(html, /h-\[220px\]/);
  assert.match(html, /role="group" tabindex="0"/);
  assert.match(html, /1 recorded points/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Home and End|Escape clears inspection/);
  assert.match(html, /temperature&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|<button|NaN|30\.[0-9]+%/);
  const empty = renderToStaticMarkup(React.createElement(MetricsChart, { points: [], unit: "", range: "1h", metricName: "Empty" }));
  assert.match(empty, /No observations in this period/);
  assert.doesNotMatch(empty, /1970|tabindex|0 samples/);
});

/** Execute the real chart callbacks with tiny hook/Recharts substitutes; no browser, network, or animation timers. */
async function loadInteractiveChart(initialPoints: MetricPoint[]) {
  const source = await readFile(new URL("../src/components/observability/metrics-chart.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const stubs = Object.fromEntries([
    "Area", "AreaChart", "CartesianGrid", "ReferenceDot", "ReferenceLine", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis",
  ].map((name) => [name, () => null]));
  const hooks: unknown[] = [];
  let cursor = 0;
  const module = { exports: {} as { MetricsChart: (props: React.ComponentProps<typeof MetricsChart>) => React.ReactNode } };
  runInNewContext(compiled, {
    React, module, exports: module.exports, Number, Math, Set, Date,
    require: (specifier: string) => {
      if (specifier === "./metrics-data") return metricsData;
      if (specifier === "recharts") return stubs;
      if (specifier === "react") return {
        ...React,
        useMemo: (callback: () => unknown, dependencies: unknown[]) => {
          const slot = cursor++;
          const current = hooks[slot] as { value: unknown; dependencies: unknown[] } | undefined;
          if (!current || dependencies.some((dependency, index) => dependency !== current.dependencies[index])) {
            hooks[slot] = { value: callback(), dependencies };
          }
          return (hooks[slot] as { value: unknown }).value;
        },
        useState: (initial: unknown) => {
          const slot = cursor++;
          if (!(slot in hooks)) hooks[slot] = typeof initial === "function" ? initial() : initial;
          return [hooks[slot], (next: unknown) => { hooks[slot] = typeof next === "function" ? next(hooks[slot]) : next; }];
        },
        useRef: (initial: unknown) => {
          const slot = cursor++;
          if (!(slot in hooks)) hooks[slot] = { current: initial };
          return hooks[slot];
        },
        useId: () => `chart-${cursor++}`,
      };
      throw new Error(`Unexpected metric chart dependency: ${specifier}`);
    },
  });
  const descendants = (node: React.ReactNode): React.ReactElement<any>[] => {
    if (Array.isArray(node)) return node.flatMap(descendants);
    if (!React.isValidElement(node)) return [];
    const element = node as React.ReactElement<any>;
    return [element, ...descendants(element.props.children)];
  };
  let points = initialPoints;
  const render = () => {
    cursor = 0;
    return descendants(module.exports.MetricsChart({ points, unit: "ms", range: "1h", metricName: "Latency" }));
  };
  const find = (type: React.ElementType, predicate = (_props: any) => true) => {
    const found = render().find((element) => element.type === type && predicate(element.props));
    assert.ok(found, "Expected chart element missing");
    return found.props;
  };
  return { stubs, find, render, setPoints: (next: MetricPoint[]) => { points = next; }, source };
}

test("real callbacks inspect across the plot, immediately clear on leave, and never retain stale refreshed evidence", async () => {
  const chart = await loadInteractiveChart([point(0, 10), point(2, 20)]);
  const dots = chart.find(chart.stubs.Area).dot;
  assert.equal(dots({ index: 0, cx: 0, cy: 100 }).type, "circle", "an isolated observation remains visible between genuine gaps");
  assert.equal(dots({ index: 1, cx: 50, cy: 100 }), null, "a missing gap never gets a dot");
  const surface = () => chart.find("div", (props) => props.role === "group");
  const readout = () => chart.render().find((element) => typeof element.type === "function" && element.type.name === "MetricChartReadout")?.props.point as MetricPoint | null;
  chart.find(chart.stubs.AreaChart).onMouseMove({ isTooltipActive: true, activeTooltipIndex: "2" });
  assert.equal(readout()?.value, 20);
  assert.ok(chart.render().some((element) => element.type === chart.stubs.ReferenceLine));
  chart.setPoints([point(0, 10), point(2, 21)]);
  assert.equal(readout()?.value, 21, "refresh updates the same hovered timestamp without losing inspection");
  surface().onPointerLeave();
  assert.equal(readout(), null);
  chart.find(chart.stubs.AreaChart).onMouseMove({ isTooltipActive: true, activeTooltipIndex: "1" });
  assert.equal(readout(), null, "a manufactured gap must not pretend it has an observation");
  surface().onFocus();
  assert.equal(readout()?.value, 21);
  let prevented = 0;
  surface().onKeyDown({ key: "Home", preventDefault: () => { prevented++; } });
  assert.equal(readout()?.value, 10);
  surface().onKeyDown({ key: "Escape", preventDefault: () => { prevented++; } });
  assert.equal(readout(), null);
  surface().onKeyDown({ key: "End", preventDefault: () => { prevented++; } });
  assert.equal(readout()?.value, 21);
  chart.setPoints([point(0, 999), point(2, 22)]);
  assert.equal(readout()?.value, 22, "keyboard inspection also follows the same real bucket, not an old value");
  chart.setPoints([point(0, 999)]);
  assert.equal(readout(), null);
  chart.setPoints([point(0, 999), point(2, 23)]);
  assert.equal(readout(), null, "a removed bucket must not resurrect a stale inspection later");
  assert.equal(prevented, 3);
  assert.match(chart.source, /connectNulls=\{false\}/);
  assert.match(chart.source, /isAnimationActive=\{false\}/);
  assert.doesNotMatch(chart.source, /setTimeout|role="application"|TrendChart|text-violet/);
});
