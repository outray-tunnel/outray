import assert from "node:assert/strict";
import test from "node:test";
import { parseHttpRequestsSearch } from "../src/components/observability/http-requests-search";

test("HTTP request URL defaults are optional and omit equivalent all/one-hour values", () => {
  assert.deepEqual(parseHttpRequestsSearch({}), {});
  assert.deepEqual(parseHttpRequestsSearch({ search: "  ", method: "all", status: "all", capture: "all", range: "1h" }), {});
  assert.deepEqual(parseHttpRequestsSearch({ search: "", service: "", method: "", status: "", capture: "", range: "" }), {});
  assert.deepEqual(parseHttpRequestsSearch({ service: " \t\n ", method: "  " }), {});
});

test("search text is trimmed without lowercasing or decoding literal query text", () => {
  assert.deepEqual(parseHttpRequestsSearch({ search: "  POST /payments?value=one%2Ftwo+three  " }), { search: "POST /payments?value=one%2Ftwo+three" });
});

test("service names retain exact whitespace, case and encoding-like characters", () => {
  for (const service of ["all", "payments-worker", "Payments Worker", " api ", " all ", "api%2Fworker", "api+worker", "api/worker?x=1&y=2", "%25%252F", "service#fragment", "服务 🚀", "__proto__"]) {
    assert.deepEqual(parseHttpRequestsSearch({ service }), { service });
  }
});

test("standard and dynamic HTTP method tokens roundtrip with exact case and characters", () => {
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "CONNECT", "TRACE", "PROPFIND", "M-SEARCH", "CUSTOM_METHOD", "get", "customMethod", "GET%20", "METHOD!#$%&'*+-.^_`|~"]) {
    assert.deepEqual(parseHttpRequestsSearch({ method }), { method });
  }
  for (const method of [" GET ", "POST\n", "GET\r\n", "GET\t", "GET/POST", "GET?", "METHOD:GET", "GET🚀"]) {
    assert.deepEqual(parseHttpRequestsSearch({ method }), {});
  }
});

test("status, capture and nondefault ranges accept only their current DTO choices", () => {
  for (const status of ["success", "errors"]) assert.deepEqual(parseHttpRequestsSearch({ status }), { status });
  for (const capture of ["full", "metadata", "redacted"]) assert.deepEqual(parseHttpRequestsSearch({ capture }), { capture });
  for (const range of ["6h", "24h", "7d", "30d"]) assert.deepEqual(parseHttpRequestsSearch({ range }), { range });
  for (const input of [{ status: "200" }, { status: "SUCCESS" }, { capture: "captured" }, { capture: "Full" }, { range: "live" }, { range: "6H" }, { range: "90d" }]) {
    assert.deepEqual(parseHttpRequestsSearch(input), {});
  }
});

test("arrays, objects and other wrong types are dropped rather than coerced", () => {
  for (const value of [undefined, null, false, true, 123, [], ["GET"], {}, { toString: () => "GET" }]) {
    assert.deepEqual(parseHttpRequestsSearch({ search: value, service: value, method: value, status: value, capture: value, range: value }), {});
  }
});

test("the parser preserves valid combined filters, ignores unrelated keys and never mutates input", () => {
  const input = Object.freeze({ search: "  checkout  ", service: "api%2Fworker", method: "POST", status: "errors", capture: "redacted", range: "7d", page: 99, trace: "ignored" });
  const expected = { search: "checkout", service: "api%2Fworker", method: "POST", status: "errors", capture: "redacted", range: "7d" };
  const parsed = parseHttpRequestsSearch(input);
  assert.deepEqual(parsed, expected);
  assert.deepEqual(parseHttpRequestsSearch(parsed as Record<string, unknown>), expected);
  assert.equal(input.search, "  checkout  ");
  assert.notEqual(parsed, input);
  assert.deepEqual(parseHttpRequestsSearch({ service: "all", status: "errors", range: "24h" }), { service: "all", status: "errors", range: "24h" });
});
