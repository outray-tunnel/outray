import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentEvidenceCards } from "../src/components/agent/agent-evidence-cards";
import type { AgentEvidencePresentation, AgentEvidenceReference } from "../src/lib/agent/protocol";

Object.assign(globalThis, { React });
function evidence(presentation: AgentEvidencePresentation, overrides: Partial<AgentEvidenceReference> = {}): AgentEvidenceReference {
  return { id: `test:${presentation.kind}`, label: `${presentation.kind} evidence`, href: "/acme/observability/requests?search=request&range=30d", observedAt: "2026-10-08T13:00:00.000Z", presentation, ...overrides };
}
const render = (...items: AgentEvidenceReference[]) => renderToStaticMarkup(React.createElement(AgentEvidenceCards, { evidence: items, orgSlug: "acme" }));
const request: AgentEvidencePresentation = { kind: "request", method: "GET", route: "/api/orders", service: "checkout-api", statusCode: 200, durationMs: 783, timestamp: "2026-10-08T01:00:00.000Z", captureState: "redacted", requestSizeBytes: 0, responseSizeBytes: 48 };
const comparison: Extract<AgentEvidencePresentation, { kind: "comparison" }> = { kind: "comparison", hours: 24, service: null, path: null, totalRequests: 49_318, errorRequests: 1_495, errorRate: 3.03, p95DurationMs: 2_063, averageDurationMs: null, measurement: "aggregate", sampleSize: null, truncated: false };
const span = (index: number): Extract<AgentEvidencePresentation, { kind: "trace" }>["spans"][number] => ({ spanId: String(index).padStart(16, "0"), parentSpanId: index ? "0000000000000000" : null, operationName: index ? null : "GET /api/orders", service: "checkout-api", startedAt: "2026-10-08T01:00:00.000Z", offsetMs: index * 63, durationMs: index ? 157 : 783, status: "ok", kind: index ? 1 : 2 });

test("request evidence renders compact factual metadata with HTTP status, units and event time", () => {
  const html = render(evidence(request));
  assert.match(html, /aria-label="Evidence details"/);
  assert.match(html, /aria-label="Observed request"/);
  assert.match(html, /HTTP 200/);
  assert.match(html, /data-tone="ok"/);
  assert.match(html, /GET.*\/api\/orders/);
  assert.match(html, /<dt>Service<\/dt><dd>checkout-api/);
  assert.match(html, /783 ms|0 B|48 B/);
  assert.match(html, /Event time: Oct 8, 01:00 UTC/);
  assert.match(html, /Payloads are redacted/);
  assert.doesNotMatch(html, /Healthy|root cause|Prototype|scripted/i);
});

test("missing request fields stay unknown and error HTTP statuses have labeled danger tone", () => {
  const html = render(evidence({ ...request, method: null, route: null, service: null, statusCode: 503, durationMs: null, requestSizeBytes: null, responseSizeBytes: null, timestamp: null, captureState: "unknown" }));
  assert.match(html, /Unknown method|Unknown route|<dd>Unknown<\/dd>/);
  assert.match(html, /HTTP 503/);
  assert.match(html, /data-tone="error"/);
  assert.match(html, /Event time: Unknown/);
  assert.doesNotMatch(html, />0 ms|>0 B/);
});

test("comparison renders 1-hour and 24-hour tiles using percentage rather than multiplying it", () => {
  const html = render(evidence(comparison, { id: "24h" }), evidence({ ...comparison, hours: 1, totalRequests: 17, errorRequests: 1, errorRate: 5.88 }, { id: "1h" }));
  assert.ok(html.indexOf("Last hour") < html.indexOf("Last 24 hours"));
  assert.match(html, /49,318/);
  assert.match(html, /3\.03%/);
  assert.match(html, /2,063 ms/);
  assert.match(html, /Error requests<\/dt><dd>1,495/);
  assert.doesNotMatch(html, /Average duration|1,495 error requests/);
  assert.match(html, /Aggregate measurements, not a root-cause diagnosis/);
  assert.doesNotMatch(html, /303%|48 hours/);
});

test("empty and bounded sample comparisons never claim a healthy rate or full period count", () => {
  const empty = render(evidence({ ...comparison, totalRequests: 0, errorRequests: 0, errorRate: 0, p95DurationMs: 0 }));
  assert.match(empty, /No matching requests/);
  assert.match(empty, /Error rate<\/dt><dd>Unavailable/);
  assert.match(empty, /p95 duration<\/dt><dd>Unavailable/);
  assert.doesNotMatch(empty, />0%|>0 ms/);
  const sample = render(evidence({ ...comparison, measurement: "sample", totalRequests: null, sampleSize: 3, truncated: true }));
  assert.match(sample, /Matching samples<\/dt><dd>3/);
  assert.match(sample, /Bounded sample, not a complete period total/);
  assert.match(sample, /Results are truncated/);
});

test("trace timing visualizes actual offsets, exposes readable status, and collapses additional spans", () => {
  const spans = Array.from({ length: 8 }, (_, index) => span(index));
  spans[1].status = "error";
  const html = render(evidence({ kind: "trace", spanCount: 11, returnedSpanCount: 8, truncated: true, spans }));
  assert.match(html, /11 spans/);
  assert.match(html, /Show 2 more spans/);
  assert.match(html, /<details/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, /offset 63 ms; duration 157 ms/);
  assert.match(html, /data-tone="error"/);
  assert.match(html, /Unknown operation/);
  assert.match(html, /Showing 8 of 11 spans/);
  const timing = html.match(/data-tone="error" style="left:([\d.]+)%;width:([\d.]+)%"/);
  assert.ok(timing);
  assert.ok(Math.abs(Number(timing[1]) - 63 / 783 * 100) < 0.000_001);
  assert.ok(Math.abs(Number(timing[2]) - 157 / 783 * 100) < 0.000_001);
  assert.doesNotMatch(html, /database|downstream/i);
});

test("missing trace timing remains unknown instead of inventing a duration", () => {
  const unknown = { ...span(0), durationMs: null, offsetMs: null, operationName: null, kind: null, status: "unknown" as const };
  const html = render(evidence({ kind: "trace", spanCount: 1, returnedSpanCount: 1, truncated: false, spans: [unknown] }));
  assert.match(html, /Unknown operation/);
  assert.match(html, /Unknown kind/);
  assert.match(html, /status unknown/);
  assert.match(html, /Timing unknown/);
  assert.match(html, /Timing unavailable/);
  assert.doesNotMatch(html, />1 ms</);
  assert.doesNotMatch(html, /style="left/);
});

test("trace scale distinguishes empty timing from a measured zero duration", () => {
  const empty = render(evidence({ kind: "trace", spanCount: 0, returnedSpanCount: 0, truncated: false, spans: [] }));
  assert.match(empty, /Timing unavailable/);
  assert.doesNotMatch(empty, />1 ms</);
  const zero = render(evidence({ kind: "trace", spanCount: 1, returnedSpanCount: 1, truncated: false, spans: [{ ...span(0), offsetMs: 0, durationMs: 0 }] }));
  assert.match(zero, />0 ms</);
  assert.doesNotMatch(zero, /Timing unavailable|NaN|Infinity|>1 ms</);
});

test("incomplete span timing does not inflate the measured trace extent", () => {
  const html = render(evidence({ kind: "trace", spanCount: 3, returnedSpanCount: 3, truncated: false, spans: [span(0), { ...span(1), offsetMs: 10_000, durationMs: null }, { ...span(2), offsetMs: null, durationMs: 10_000 }] }));
  assert.match(html, /Relative to trace start<\/span><span>783 ms/);
  assert.doesNotMatch(html, /Relative to trace start<\/span><span>10,000 ms/);
});

test("logs render safe metadata and category hints, with additional rows collapsed", () => {
  const logs = Array.from({ length: 6 }, (_, index) => evidence({ kind: "log", level: index ? "INFO" : "ERROR", timestamp: "2026-10-08T01:00:00.000Z", service: "checkout-api", messageSummary: "Message withheld; timeout category hint.", spanId: null }, { id: `log:${index}`, href: "/acme/observability/logs?search=trace&range=24h" }));
  const html = render(...logs);
  assert.match(html, /Correlated logs/);
  assert.match(html, /6 returned/);
  assert.match(html, /Show 2 more logs/);
  assert.match(html, /Raw log messages are withheld/);
  assert.match(html, /timeout category hint/);
  assert.match(html, /data-tone="error"/);
  assert.match(html, /<time dateTime="2026-10-08T01:00:00.000Z"/i);
  assert.match(html, /View logs/);
});

test("the component escapes telemetry and rejects external, cross-workspace and unsupported links", () => {
  const hostile = render(evidence({ ...request, route: "<script>alert(1)</script>", service: "<img src=x onerror=alert(1)>" }));
  assert.match(hostile, /&lt;script&gt;/);
  assert.doesNotMatch(hostile, /<script>|<img src/);
  for (const href of ["https://evil.example", "//evil.example", "/other/observability/requests", "/acme/settings", "javascript:alert(1)"]) assert.equal(render(evidence(request, { href })), "", href);
});

test("legacy evidence requires no presentation and is left to normal citation chips", () => {
  const legacy = evidence(request);
  delete legacy.presentation;
  assert.equal(render(legacy), "");
});

test("evidence cards adapt at mobile widths, preserve keyboard focus and respect reduced motion", async () => {
  const css = await readFile(new URL("../src/components/agent/agent-evidence-cards.module.css", import.meta.url), "utf8");
  assert.match(css, /\.inspect:focus-visible, \.more > summary:focus-visible/);
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.comparisons \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/);
  assert.doesNotMatch(css, /animation:|position:\s*fixed/);
});
