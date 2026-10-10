import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseMetricsPayload } from "../src/metrics.js";
import { toTinybirdMetric } from "../src/tinybird.js";

const timestamp = "1788080400123456789";

function gauge(dataPoints: Record<string, unknown>[]) {
  return parseMetricsPayload({
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [{ name: "exact.integer", gauge: { dataPoints } }],
          },
        ],
      },
    ],
  });
}

test("Tinybird stores OTLP signed int64 JSON strings without precision loss", () => {
  const integers = [
    "7",
    "0",
    "-7",
    "9007199254740993",
    "9223372036854775807",
    "-9223372036854775808",
  ];
  const parsed = gauge(
    integers.map((asInt) => ({ timeUnixNano: timestamp, asInt })),
  );
  assert.equal(parsed.rejected, 0);
  assert.equal(parsed.points.length, integers.length);
  for (const [index, point] of parsed.points.entries()) {
    // Exercise the actual NDJSON representation sent to Tinybird, not just
    // parser types. Coercing these to JavaScript numbers loses int64 precision.
    const serialized = JSON.parse(
      JSON.stringify(toTinybirdMetric("org_test", 3, point)),
    );
    assert.equal(serialized.value_int, integers[index]);
    assert.equal(typeof serialized.value_int, "string");
    assert.equal(serialized.value, null);
  }
});

test("floating and stale scalar metrics retain null integer values", () => {
  const parsed = gauge([
    { timeUnixNano: timestamp, asDouble: 2.5 },
    { timeUnixNano: timestamp, asInt: "7", flags: 1 },
  ]);
  assert.equal(parsed.rejected, 0);
  const [floating, stale] = parsed.points.map((point) =>
    JSON.parse(JSON.stringify(toTinybirdMetric("org_test", 3, point))),
  );
  assert.equal(floating.value_int, null);
  assert.equal(floating.value, 2.5);
  assert.equal(stale.value_int, null);
  assert.equal(stale.value, null);
  assert.equal(stale.flags, 1);
});

test("unrepresentable or malformed integer metrics are rejected before storage", () => {
  const invalid = [
    "9223372036854775808",
    "-9223372036854775809",
    "7.5",
    "NaN",
    9007199254740992,
  ];
  const parsed = gauge(
    invalid.map((asInt) => ({ timeUnixNano: timestamp, asInt })),
  );
  assert.equal(parsed.rejected, invalid.length);
  assert.equal(parsed.points.length, 0);
});

test("metrics schema accepts integer strings and safely backfills prior nullable Int64 rows", () => {
  const source = readFileSync(
    new URL("../../../tinybird/datasources/otel_metrics.datasource", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /`ValueInt` Nullable\(String\) `json:\$\.value_int` CODEC\(ZSTD\(1\)\)/,
  );
  assert.match(
    source.split("FORWARD_QUERY >")[1] || "",
    /CAST\(ValueInt, 'Nullable\(String\)'\) AS ValueInt/,
  );
  // Query conversion already supports both prior Int64 and new String storage.
  // Charts and gauge alerts remain Float64; raw storage preserves exact int64.
  for (const pipe of [
    "metric_series",
    "metric_service_breakdown",
    "alert_metric_gauge",
  ]) {
    const sql = readFileSync(
      new URL(`../../../tinybird/endpoints/${pipe}.pipe`, import.meta.url),
      "utf8",
    );
    assert.match(sql, /coalesce\(Value, toFloat64\(ValueInt\)\)/);
  }
});
