import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import NumberFlow from "@number-flow/react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { formatBytes } from "../src/components/overview/format";
import { UsageNumber, type UsageNumberProps } from "../src/components/overview/usage-number";
import {
  formatUsageNumber,
  getUsageNumberConfig,
} from "../src/components/overview/usage-number-format";

Object.assign(globalThis, { React });

/** Exercise consecutive renders of the actual wrapper without a browser. */
async function numberController() {
  const source = await readFile(new URL("../src/components/overview/usage-number.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const cells: unknown[] = [];
  let cursor = 0;
  let changed = false;
  const hooks = {
    ...React,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (next: unknown) => {
        cells[index] = typeof next === "function" ? next(cells[index]) : next;
        changed = true;
      }];
    },
  };
  const modules: Record<string, unknown> = {
    react: hooks,
    "@number-flow/react": { __esModule: true, default: NumberFlow },
    "./usage-number-format": { getUsageNumberConfig },
  };
  const module = { exports: {} as { UsageNumber: typeof UsageNumber } };
  runInNewContext(compiled, {
    module, exports: module.exports, React,
    require: (specifier: string) => {
      if (Object.hasOwn(modules, specifier)) return modules[specifier];
      throw new Error(`Unexpected number wrapper import: ${specifier}`);
    },
  });
  return (props: UsageNumberProps) => {
    for (let pass = 0; pass < 5; pass++) {
      cursor = 0; changed = false;
      const element = module.exports.UsageNumber(props);
      if (!changed) return element;
    }
    throw new Error("Number wrapper did not stabilize");
  };
}

test("usage counts retain en-US whole-number formatting", () => {
  for (const metric of ["httpRequests", "protocolEvents", "errors"] as const) {
    assert.equal(formatUsageNumber(1_234, metric), "1,234");
    assert.equal(formatUsageNumber(1_234.6, metric), "1,235");
    assert.equal(getUsageNumberConfig(42, metric).suffix, "");
    assert.equal(getUsageNumberConfig(42, metric).format.maximumFractionDigits, 0);
  }
});

test("usage bytes preserve raw B and binary KB, MB, GB with one decimal", () => {
  for (const value of [
    0, 0.5, 1, 1_023, 1_024, 2_048, 1_048_575, 1_048_576, 1_048_577,
    1_073_741_823, 1_073_741_824, 1_073_741_825,
    10_000 * 1_073_741_824, 1.15 * 1_024,
  ]) {
    assert.equal(formatUsageNumber(value, "bandwidth"), formatBytes(value));
  }
  assert.equal(getUsageNumberConfig(1_023, "bandwidth").value, 1_023);
  assert.equal(getUsageNumberConfig(1_024, "bandwidth").value, 1);
  assert.equal(getUsageNumberConfig(1_024, "bandwidth").suffix, " KB");
  assert.equal(formatUsageNumber(1_024, "bandwidth"), "1.0 KB");
});

test("invalid or negative usage values are safely normalized to zero", () => {
  for (const value of [NaN, Infinity, -Infinity, -1, -0]) {
    assert.equal(formatUsageNumber(value, "httpRequests"), "0");
    assert.equal(formatUsageNumber(value, "bandwidth"), "0 B");
    assert.equal(getUsageNumberConfig(value, "bandwidth").value, 0);
  }
});

test("usage numbers preserve NumberFlow's native spring, digit direction, and fade masks", async () => {
  const render = await numberController();
  const element = render({ value: 2_048, metric: "bandwidth" });
  assert.equal(element.type, NumberFlow);
  assert.equal(element.props.value, 2);
  assert.equal(element.props.suffix, " KB");
  assert.equal(element.props.locales, "en-US");
  assert.equal(element.props.format.minimumFractionDigits, 1);
  assert.equal(element.props.format.maximumFractionDigits, 1);
  assert.equal(element.props.trend, undefined, "digit direction follows the overall value instead of individual wheels");
  assert.equal(element.props.animated, true);
  assert.equal(element.props.isolate, true);
  assert.equal(element.props.respectMotionPreference, true);
  assert.equal(element.props.willChange, true);
  assert.equal(element.props.transformTiming, undefined, "retain the library's spring-based layout motion");
  assert.equal(element.props.spinTiming, undefined, "digits follow the same native motion as layout");
  assert.equal(element.props.opacityTiming, undefined, "retain the library's softer character fades");
  assert.match(element.props.className, /tabular-nums/);
  assert.doesNotMatch(element.props.className, /--number-flow-mask/);
  assert.equal(element.props.style.fontSize, "inherit");
  assert.equal(element.props.style.lineHeight, 0.85, "compact rolling digits fit the existing headline height including soft masks");
});

test("rapid bandwidth unit changes and resets snap truthfully while same-unit changes animate", async () => {
  const render = await numberController();
  const mb = 1_048_576;
  const gb = 1_073_741_824;
  for (const [value, expectedValue, suffix, animated] of [
    [2 * mb, 2, " MB", true],
    [3 * mb, 3, " MB", true],
    [2 * gb, 2, " GB", false],
    [3 * mb, 3, " MB", false],
    [4 * mb, 4, " MB", true],
    [2 * gb, 2, " GB", false],
    [2 * gb, 2, " GB", false],
    [3 * gb, 3, " GB", true],
    [0, 0, " B", false],
    [512, 512, " B", true],
    [1_024, 1, " KB", false],
    [2_048, 2, " KB", true],
  ] as const) {
    const element = render({ value, metric: "bandwidth" });
    assert.equal(element.props.value, expectedValue);
    assert.equal(element.props.suffix, suffix);
    assert.equal(element.props.animated, animated, `${formatBytes(value)} transition`);
    assert.equal(formatUsageNumber(value, "bandwidth"), formatBytes(value));
  }
});

test("metric changes do not animate across unrelated counts, even with the same value and suffix", async () => {
  const render = await numberController();
  assert.equal(render({ value: 42, metric: "httpRequests" }).props.animated, true);
  assert.equal(render({ value: 42, metric: "errors" }).props.animated, false);
  assert.equal(render({ value: 43, metric: "errors" }).props.animated, true);
  assert.equal(render({ value: 42, metric: "httpRequests" }).props.animated, false);
  assert.equal(render({ value: 44, metric: "httpRequests" }).props.animated, true);
});

test("usage number server rendering starts at the supplied value, without a mount count-up", () => {
  for (const [metric, value, label] of [
    ["httpRequests", 1_234, "1,234"],
    ["bandwidth", 2_048, "2.0 KB"],
    ["bandwidth", 0, "0 B"],
  ] as const) {
    const html = renderToStaticMarkup(React.createElement(UsageNumber, { value, metric }));
    assert.match(html, /<number-flow-react\b/);
    assert.ok(html.includes(label), `${metric} exposes its supplied formatted value in server markup`);
    assert.doesNotMatch(html, /setTimeout|requestAnimationFrame/);
  }
});

test("custom NumberFlow formats preserve rate precision and snap between latency units", async () => {
  const render = await numberController();
  const rate = render({
    value: 1.25, metric: "errorRate",
    numberConfig: (value) => ({
      value, suffix: "%", format: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    }),
  });
  assert.equal(rate.props.value, 1.25);
  assert.equal(rate.props.suffix, "%");
  assert.equal(rate.props.format.maximumFractionDigits, 2);
  const numberConfig = (value: number) => ({
    value: value < 1000 ? value : value / 1000,
    suffix: value < 1000 ? " ms" : " s",
    format: { maximumFractionDigits: value < 1000 ? 0 : 2 },
  });
  assert.equal(render({ value: 750, metric: "p95", numberConfig }).props.animated, false);
  assert.equal(render({ value: 850, metric: "p95", numberConfig }).props.animated, true);
  const seconds = render({ value: 1_250, metric: "p95", numberConfig });
  assert.equal(seconds.props.value, 1.25);
  assert.equal(seconds.props.suffix, " s");
  assert.equal(seconds.props.animated, false);
});

test("unknown number evidence renders an em dash and does not animate into new evidence", async () => {
  const render = await numberController();
  const missing = render({ value: null, metric: "p95" });
  assert.equal(missing.type, "span");
  assert.equal(missing.props.children, "—");
  assert.equal(render({ value: 42, metric: "p95" }).props.animated, false);
  assert.equal(render({ value: 43, metric: "p95" }).props.animated, true);
  const html = renderToStaticMarkup(React.createElement(UsageNumber, {
    value: null, metric: "p95", missingLabel: "No samples",
  }));
  assert.equal(html, "<span>No samples</span>");
});
