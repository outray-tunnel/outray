import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  HttpRequestSummary,
  RequestDetailsResponse,
} from "../src/components/observability/http-requests-data";
import {
  buildRequestExplanationPreview,
  requestExplanationDemoScenarios,
} from "../src/components/observability/request-explanation-data";

function request(overrides: Partial<HttpRequestSummary> = {}): HttpRequestSummary {
  return { ...requestExplanationDemoScenarios[0].request, ...overrides };
}

function details(summary = request()): RequestDetailsResponse {
  return {
    request: {
      ...summary, url: "https://private.example/secret-url?token=secret-query",
      clientAddress: "secret-client-address", userAgent: "secret-agent", protocol: "HTTP/1.1",
      request: {
        headers: { authorization: "secret-request-header" }, headersCaptured: true, headersTruncated: false,
        query: { token: "secret-query" }, body: "secret-request-body", bodyCaptured: true,
        bodyTruncated: false, bodyContentType: "secret-content-type", size: 128,
      },
      response: {
        headers: { "set-cookie": "secret-response-header" }, headersCaptured: true, headersTruncated: false,
        body: "secret-response-body", bodyCaptured: true, bodyTruncated: false,
        bodyContentType: "secret-response-type", size: 64,
      },
      attributes: { token: "secret-attribute" }, resourceAttributes: { token: "secret-resource" },
    },
    logs: [
      { id: "secret-log-id", timestamp: summary.timestamp, level: "error", message: "secret-log-message" },
      { id: "secret-warn-id", timestamp: summary.timestamp, level: "warn", message: "secret-warning-message" },
    ],
  };
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

test("demo requests are obviously synthetic, UTC-dated and cover each preview scenario", () => {
  assert.deepEqual(requestExplanationDemoScenarios.map((scenario) => [scenario.value, scenario.label]), [
    ["server-error", "Failed request"], ["slow", "Slow request"], ["healthy", "Successful request"],
  ]);
  assert.deepEqual(requestExplanationDemoScenarios.map(({ request: item }) => [item.service, item.method, item.route, item.statusCode, item.duration]), [
    ["payments", "POST", "/api/checkout", 503, 2430],
    ["orders", "GET", "/api/orders", 200, 1840],
    ["api", "GET", "/health", 200, 84],
  ]);
  for (const scenario of requestExplanationDemoScenarios) {
    assert.match(scenario.request.id, /^demo-/);
    assert.match(scenario.request.requestId, /^demo-/);
    assert.match(scenario.request.timestamp, /^2026-10-08T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(scenario.request.environment, "demo");
    assert.equal(buildRequestExplanationPreview(scenario.request).category, scenario.value);
  }
});

test("rich demo previews label mock trace and log clues as illustrative and unconfirmed", () => {
  const failed = requestExplanationDemoScenarios[0].preview!;
  assert.equal(failed.title, "The payment-provider call is the strongest lead");
  assert.equal(failed.hypothesis?.title, "Payment provider timeout");
  assert.equal(failed.evidence.find((item) => item.id === "sample-provider-span")?.value, "2400 ms · ~99%");
  assert.equal(failed.evidence.find((item) => item.id === "correlated-logs")?.value, "1 timeout log");
  const slow = requestExplanationDemoScenarios[1].preview!;
  assert.equal(slow.title, "Most time was spent in the database span");
  assert.equal(slow.hypothesis?.title, "A slow query or connection wait");
  assert.equal(slow.evidence.find((item) => item.id === "sample-database-span")?.value, "1720 ms · ~93%");
  for (const preview of [failed, slow]) {
    assert.match(preview.summary, /^In this sample,/);
    assert.match(preview.hypothesis!.detail, /^Unconfirmed hypothesis:/);
    assert.match(preview.limitations.join(" "), /All traces, logs, and timings are illustrative sample data/);
    assert.match(preview.limitations.join(" "), /No live AI call or service read was performed/);
    assert.match(preview.limitations.join(" "), /no definitive cause is established/);
    assert.match(preview.limitations.join(" "), /baseline.*deployment history/);
    assert.equal(preview.nextChecks.length, 3);
    assert.deepEqual(preview.followUps.map((item) => item.label), ["What caused this?", "What is confirmed?", "What should I check next?"]);
    assert.ok(preview.evidence.every((item) => /Sample/.test(item.label)));
  }
});

test("rich demo clues remain isolated from the metadata-only request builder", () => {
  for (const scenario of requestExplanationDemoScenarios.filter((item) => item.preview)) {
    const realRequest = { ...scenario.request, id: "real-request", requestId: "real-request-id", environment: "production" };
    for (const summary of [scenario.request, realRequest]) {
      const preview = buildRequestExplanationPreview(summary, details(summary));
      assert.notDeepEqual(preview, scenario.preview);
      assert.doesNotMatch(JSON.stringify(preview), /payment-provider|provider timeout|2400 ms|database span|1720 ms|timeout log|mock trace|mock log/i);
      assert.match(preview.limitations.join(" "), /No trace spans, downstream calls, databases, recovery events, or historical baselines were analyzed/);
      assert.equal(preview.evidence.find((item) => item.id === "correlated-logs")?.value, "2 logs");
      assert.ok(preview.evidence.every((item) => !item.id.startsWith("sample-")));
    }
  }
});

test("status categories take precedence over the explicit preview duration cutoff", () => {
  for (const statusCode of [500, 503, 599]) {
    assert.equal(buildRequestExplanationPreview(request({ statusCode, duration: 20 })).category, "server-error");
  }
  for (const statusCode of [400, 401, 404, 499]) {
    assert.equal(buildRequestExplanationPreview(request({ statusCode, duration: 2000 })).category, "client-error");
  }
  for (const statusCode of [200, 204, 302, 399]) {
    assert.equal(buildRequestExplanationPreview(request({ statusCode, duration: 999.99 })).category, "healthy");
    assert.equal(buildRequestExplanationPreview(request({ statusCode, duration: 1000 })).category, "slow");
  }
});

test("null, invalid and interim status and invalid duration never become invented measurements", () => {
  for (const statusCode of [null, undefined, NaN, Infinity, -1, 0, 600, 200.5]) {
    const preview = buildRequestExplanationPreview(request({ statusCode: statusCode as number, duration: 20 }));
    assert.equal(preview.category, "unknown");
    assert.equal(preview.evidence.find((item) => item.id === "http-status")?.value, "Not recorded");
    assert.match(preview.limitations.join(" "), /valid HTTP status was not recorded/);
  }
  const interim = buildRequestExplanationPreview(request({ statusCode: 103, duration: 20 }));
  assert.equal(interim.category, "unknown");
  assert.match(interim.limitations.join(" "), /interim HTTP status/);
  for (const duration of [null, undefined, NaN, Infinity, -Infinity, -1]) {
    const preview = buildRequestExplanationPreview(request({ statusCode: 200, duration: duration as number }));
    assert.equal(preview.category, "unknown");
    assert.equal(preview.evidence.find((item) => item.id === "duration")?.value, "Not recorded");
    assert.match(preview.limitations.join(" "), /valid request duration was not recorded/);
    assert.equal(buildRequestExplanationPreview(request({ duration: duration as number })).category, "server-error");
  }
  assert.equal(buildRequestExplanationPreview(request({ statusCode: 200, duration: 0 })).category, "healthy");
});

test("facts stay separate from unconfirmed hypotheses and do not invent a root cause", () => {
  const summary = request();
  const preview = buildRequestExplanationPreview(summary, details(summary));
  assert.equal(preview.evidence.find((item) => item.id === "http-status")?.value, "HTTP 503");
  assert.equal(preview.evidence.find((item) => item.id === "duration")?.value, "2430 ms");
  assert.equal(preview.evidence.find((item) => item.id === "correlated-logs")?.value, "2 logs");
  assert.match(preview.evidence.find((item) => item.id === "correlated-logs")!.detail, /1 error-level and 1 warning-level/);
  assert.match(preview.hypothesis!.detail, /^Unconfirmed hypothesis:/);
  assert.match(preview.summary, /not the root cause/);
  assert.match(preview.limitations.join(" "), /No trace spans, downstream calls, databases, recovery events, or historical baselines were analyzed/);
  for (const scenario of requestExplanationDemoScenarios) {
    const output = buildRequestExplanationPreview(scenario.request);
    assert.equal(output.hypothesis === null, scenario.value === "healthy");
    assert.match(output.limitations.join(" "), /1000 ms slow threshold is a preview cutoff, not a measured baseline/);
    assert.deepEqual(output.followUps.map((item) => item.id), ["root-cause", "confidence", "next-checks"]);
  }
});

test("not-loaded metadata is unknown rather than zero and stale details are ignored", () => {
  const summary = request({ captureState: "metadata", traceId: "" });
  for (const unavailable of [undefined, null]) {
    const preview = buildRequestExplanationPreview(summary, unavailable);
    assert.equal(preview.evidence.find((item) => item.id === "correlated-logs")?.value, "Not loaded");
    assert.match(preview.limitations.join(" "), /Request details are not loaded/);
    assert.match(preview.limitations.join(" "), /Metadata-only capture/);
    assert.match(preview.limitations.join(" "), /No trace identifier/);
  }
  const preview = buildRequestExplanationPreview(summary, details(request({ id: "another-request" })));
  assert.equal(preview.evidence.find((item) => item.id === "correlated-logs")?.value, "Not loaded");
  assert.match(preview.limitations.join(" "), /different request and were not used/);
});

test("redacted, uncaptured and truncated capture gaps are explicitly retained", () => {
  const summary = request();
  const payload = details(summary);
  payload.request.request.headersCaptured = false;
  payload.request.request.bodyCaptured = false;
  payload.request.request.headersTruncated = true;
  payload.request.response.bodyTruncated = true;
  const preview = buildRequestExplanationPreview(summary, payload);
  assert.equal(preview.evidence.find((item) => item.id === "capture")?.value, "2 of 4 fields captured");
  assert.match(preview.limitations.join(" "), /Capture is redacted/);
  assert.match(preview.limitations.join(" "), /Request headers were not captured/);
  assert.match(preview.limitations.join(" "), /Request body was not captured/);
  assert.match(preview.limitations.join(" "), /Request headers were truncated/);
  assert.match(preview.limitations.join(" "), /Response body was truncated/);
  payload.logs = [];
  assert.match(buildRequestExplanationPreview(summary, payload).limitations.join(" "), /No correlated logs were returned; this does not prove there were no errors/);
});

test("the output never includes raw identity, route, payload, attributes or log values", () => {
  const summary = request({
    id: "secret-request-id", requestId: "secret-external-id", traceId: "secret-trace", spanId: "secret-span",
    route: "secret-route", path: "secret-path", method: "secret-method", service: "secret-service",
    region: "secret-region", environment: "secret-environment", timestamp: "secret-timestamp",
  });
  const serialized = JSON.stringify(buildRequestExplanationPreview(summary, details(summary)));
  assert.doesNotMatch(serialized, /secret-|private\.example|authorization|set-cookie/);
  assert.match(serialized, /Identifier attached/);
  assert.match(serialized, /messages were not read/);
});

test("raw payload and log values are not even read while building the preview", () => {
  const summary = request();
  const payload = details(summary);
  function forbidRead(target: object, property: string) {
    Object.defineProperty(target, property, { get() { throw new Error(`Forbidden read: ${property}`); } });
  }
  for (const property of ["route", "path", "service", "environment", "region", "timestamp"]) forbidRead(summary, property);
  for (const property of ["url", "clientAddress", "userAgent", "attributes", "resourceAttributes"]) forbidRead(payload.request, property);
  for (const property of ["headers", "query", "body", "bodyContentType"]) forbidRead(payload.request.request, property);
  for (const property of ["headers", "body", "bodyContentType"]) forbidRead(payload.request.response, property);
  for (const log of payload.logs) {
    forbidRead(log, "message");
    forbidRead(log, "id");
    forbidRead(log, "timestamp");
  }
  assert.doesNotThrow(() => buildRequestExplanationPreview(summary, payload));
});

test("the preview is deterministic, does not mutate input and makes no network calls", (t) => {
  let fetchCount = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCount++;
    throw new Error("Network calls are forbidden in the local preview");
  });
  const summary = freeze(request());
  const payload = freeze(details(summary));
  const before = JSON.stringify({ summary, payload });
  const first = buildRequestExplanationPreview(summary, payload);
  assert.deepEqual(buildRequestExplanationPreview(summary, payload), first);
  assert.equal(JSON.stringify({ summary, payload }), before);
  assert.equal(fetchCount, 0);
  first.nextChecks.push("changed output");
  first.hypothesis!.detail = "changed hypothesis";
  const next = buildRequestExplanationPreview(summary, payload);
  assert.doesNotMatch(JSON.stringify(next), /changed output|changed hypothesis/);
  const source = readFileSync(new URL("../src/components/observability/request-explanation-data.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|from\s+["'](?:@ai-sdk|ai|openai|axios|node:)/);
  assert.match(source, /^import type /);
});
