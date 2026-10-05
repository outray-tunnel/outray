import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  formatInspectorDuration, formatInspectorTime, requestInspectorCurl,
  requestInspectorIdentity, requestInspectorStatus, requestInspectorUrl, requestQueryEntries,
} from "../src/components/requests/request-inspector-data";
import type { RequestCapture, TunnelEvent } from "../src/components/requests/types";

const request: TunnelEvent = {
  request_id: "request-1", timestamp: 1_800_000_000_000, tunnel_id: "tunnel-a", organization_id: "org-a",
  host: "api.example.com", method: "POST", path: "/checkout?tag=one&tag=two&empty=&value=a%2Bb%3Fc",
  status_code: 201, request_duration_ms: 1250, bytes_in: 32, bytes_out: 1024, client_ip: "127.0.0.1", user_agent: "Test client",
};
const capture: RequestCapture = {
  id: "request-1", timestamp: new Date(request.timestamp).toISOString(), tunnelId: "tunnel-a",
  request: { headers: { "Content-Type": "application/json", "X-Values": ["one", "two"] }, body: "0", bodySize: 1 },
  response: { headers: {}, body: "false", bodySize: 5 },
};

test("request identity uses organization, tunnel, time and request ID rather than object identity", () => {
  const identity = requestInspectorIdentity("acme", request);
  assert.equal(identity, requestInspectorIdentity("acme", { ...request }));
  assert.notEqual(identity, requestInspectorIdentity("other", request));
  for (const changed of [{ tunnel_id: "other" }, { timestamp: 1 }, { request_id: "other" }]) {
    assert.notEqual(identity, requestInspectorIdentity("acme", { ...request, ...changed }));
  }
});

test("query parameters preserve repeated, empty, encoded and prototype-named keys", () => {
  assert.deepEqual(requestQueryEntries(request.path), [["tag", "one"], ["tag", "two"], ["empty", ""], ["value", "a+b?c"]]);
  assert.deepEqual(requestQueryEntries("/?__proto__=value&x=a?b#not-a-query"), [["__proto__", "value"], ["x", "a?b"]]);
  assert.deepEqual(requestQueryEntries("/plain"), []);
});

test("URL formatting recognizes genuine loopback hosts without matching arbitrary localhost text", () => {
  assert.equal(requestInspectorUrl(request), "https://api.example.com" + request.path);
  for (const host of ["localhost:8000", "127.0.0.1:8000", "[::1]:8000"]) {
    assert.equal(requestInspectorUrl({ host, path: "/health" }), "http://" + host + "/health");
  }
  assert.equal(requestInspectorUrl({ host: "localhost.example.com", path: "/" }), "https://localhost.example.com/");
  assert.equal(requestInspectorUrl({ host: "https://example.com/", path: "path" }), "https://example.com/path");
  assert.equal(requestInspectorUrl({ host: "", path: "/known/path" }), "/known/path");
});

test("cURL includes actual captured headers and primitive/empty bodies without synthetic data", () => {
  const curl = requestInspectorCurl(request, capture);
  assert.match(curl, /--header 'X-Values: one'/);
  assert.match(curl, /--header 'X-Values: two'/);
  assert.match(curl, /--data-raw '0'/);
  assert.doesNotMatch(curl, /X-Forwarded-For|Test client/);
  assert.match(requestInspectorCurl(request, { ...capture, request: { ...capture.request, body: "" } }), /--data-raw ''/);
  const basic = requestInspectorCurl(request, null);
  assert.match(basic, /User-Agent: Test client/);
  assert.doesNotMatch(basic, /--data-raw|Content-Type|X-Values|X-Forwarded-For/);
});

test("cURL shell arguments roundtrip quotes, substitutions and newlines without executing them", () => {
  const body = "quote's $(printf UNSAFE)\nnext line; literal";
  const header = "x' $(printf UNSAFE); value";
  const path = "/quote's?text=$(printf UNSAFE)";
  const command = requestInspectorCurl({ ...request, path, method: "POST'" }, {
    ...capture, request: { headers: { "X-Test": header }, body, bodySize: body.length },
  });
  // A local shell function only prints arguments; no HTTP request is made.
  const result = execFileSync("/bin/bash", ["-c", 'curl() { printf "%s\\0" "$@"; }\n' + command], { encoding: "utf8" });
  assert.deepEqual(result.split("\0").slice(0, -1), [
    "--request", "POST'", "--url", "https://api.example.com" + path, "--header", "X-Test: " + header, "--data-raw", body,
  ]);
});

test("status and duration labels distinguish unknown observations from measured zero", () => {
  for (const code of [0, -1, 600, NaN, 200.5]) {
    assert.equal(requestInspectorStatus(code).label, "Unknown status");
    assert.match(requestInspectorStatus(code).tone, /zinc-400/);
  }
  for (const [code, tone] of [[201, "emerald"], [302, "zinc"], [404, "amber"], [503, "rose"], [103, "sky"]] as const) {
    assert.ok(requestInspectorStatus(code).label.startsWith(String(code)));
    assert.ok(requestInspectorStatus(code).tone.includes(tone));
  }
  assert.equal(formatInspectorDuration(0), "0 ms");
  assert.equal(formatInspectorDuration(1250), "1.3 s");
  assert.equal(formatInspectorDuration(NaN), "—");
  assert.equal(formatInspectorTime(NaN).text, "Unknown time");
  assert.equal(formatInspectorTime(request.timestamp).iso, new Date(request.timestamp).toISOString());
});
