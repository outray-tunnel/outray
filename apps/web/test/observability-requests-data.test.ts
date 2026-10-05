import assert from "node:assert/strict";
import test from "node:test";
import {
  formatHttpRequestDuration,
  formatHttpRequestNumber,
  formatHttpRequestTime,
  parseHttpRequestTimestamp,
} from "../src/components/observability/http-requests-data";

test("HTTP request durations preserve precision and separate their units", () => {
  assert.equal(formatHttpRequestDuration(0), "0 ms");
  assert.equal(formatHttpRequestDuration(-0), "0 ms");
  assert.equal(formatHttpRequestDuration(12.345), `${formatHttpRequestNumber(12.345)} ms`);
  assert.equal(formatHttpRequestDuration(999), "999 ms");
  assert.equal(formatHttpRequestDuration(1_000), "1.00 s");
  assert.equal(formatHttpRequestDuration(1_250), "1.25 s");
  assert.equal(formatHttpRequestDuration(12_345), "12.35 s");
});

test("HTTP request numbers use the existing locale-aware two-decimal maximum", () => {
  assert.equal(formatHttpRequestNumber(0), "0");
  assert.equal(formatHttpRequestNumber(-0), "0");
  for (const value of [1, 12.345, 1_234.5, 100_000]) {
    assert.equal(formatHttpRequestNumber(value), value.toLocaleString(undefined, { maximumFractionDigits: 2 }));
  }
});

test("missing, negative and nonfinite measurements are not presented as real values", () => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, -0.01, -1]) {
    assert.equal(formatHttpRequestDuration(value), "—");
    assert.equal(formatHttpRequestNumber(value), "—");
  }
  assert.equal(formatHttpRequestDuration(), "—");
  assert.equal(formatHttpRequestNumber(), "—");
});

test("Tinybird HTTP request timestamps normalize missing zones and nanosecond fractions to UTC", () => {
  const expected = Date.UTC(2026, 9, 5, 12, 34, 56, 123);
  for (const value of [
    "2026-10-05 12:34:56.123456789",
    "2026-10-05T12:34:56.123",
    " 2026-10-05 12:34:56.123456789 ",
    "2026-10-05T12:34:56.123456789Z",
  ]) assert.equal(parseHttpRequestTimestamp(value), expected);
  assert.equal(parseHttpRequestTimestamp("2026-10-05 12:34:56"), Date.UTC(2026, 9, 5, 12, 34, 56));
  assert.equal(parseHttpRequestTimestamp("2026-10-05T12:34:56.1"), Date.UTC(2026, 9, 5, 12, 34, 56, 100));
});

test("explicit HTTP request timestamp offsets are honored", () => {
  const expected = Date.UTC(2026, 9, 5, 12, 34, 56, 123);
  for (const value of [
    "2026-10-05T12:34:56.123z",
    "2026-10-05 13:34:56.123456789+01:00",
    "2026-10-05T13:34:56.123+0100",
    "2026-10-05T08:04:56.123-04:30",
    "2026-10-05 08:04:56.123-0430",
  ]) assert.equal(parseHttpRequestTimestamp(value), expected);
});

test("invalid HTTP request timestamps are missing instead of displaying raw input", () => {
  for (const value of ["", "   ", "not a timestamp", "2026-10-05", "2026-02-30 12:34:56", "2026-10-05T24:00:00Z", "2026-10-05 12:34:56+25:00"]) {
    assert.equal(parseHttpRequestTimestamp(value), null);
    assert.equal(formatHttpRequestTime(value), "—");
  }
});

test("valid HTTP request times render the existing human-readable local date and clock", () => {
  const timestamp = "2026-10-05 12:34:56.123456789";
  const expected = new Date(Date.UTC(2026, 9, 5, 12, 34, 56, 123)).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  assert.equal(formatHttpRequestTime(timestamp), expected);
  assert.equal(formatHttpRequestTime("2026-10-05T13:34:56.123+01:00"), expected);
});
