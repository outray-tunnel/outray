import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeHttpMethod } from "../src/lib/observability/http-method";

test("normalizes supported HTTP methods", () => {
  assert.equal(normalizeHttpMethod(" post "), "POST");
});

test("falls back safely for shell syntax in an untrusted method", () => {
  assert.equal(normalizeHttpMethod("GET; touch /tmp/pwned"), "GET");
});
