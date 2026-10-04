import assert from "node:assert/strict";
import test from "node:test";
import NumberFlow from "@number-flow/react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatBytes } from "../src/components/overview/format";
import { UsageNumber } from "../src/components/overview/usage-number";
import {
  formatUsageNumber,
  getUsageNumberConfig,
} from "../src/components/overview/usage-number-format";

Object.assign(globalThis, { React });

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

test("usage numbers use the real NumberFlow with short isolated reduced-motion-aware transitions", () => {
  const element = UsageNumber({ value: 2_048, metric: "bandwidth" });
  assert.equal(element.type, NumberFlow);
  assert.equal(element.props.value, 2);
  assert.equal(element.props.suffix, " KB");
  assert.equal(element.props.locales, "en-US");
  assert.equal(element.props.format.minimumFractionDigits, 1);
  assert.equal(element.props.format.maximumFractionDigits, 1);
  assert.equal(element.props.trend, 0);
  assert.equal(element.props.animated, true);
  assert.equal(element.props.isolate, true);
  assert.equal(element.props.respectMotionPreference, true);
  assert.equal(element.props.transformTiming.duration, 220);
  assert.equal(element.props.spinTiming.duration, 220);
  assert.equal(element.props.opacityTiming.duration, 120);
  assert.match(element.props.className, /tabular-nums/);
  assert.match(element.props.className, /\[--number-flow-mask-height:0px\]/);
  assert.equal(element.props.style.fontSize, "inherit");
  assert.equal(element.props.style.lineHeight, "inherit");
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
