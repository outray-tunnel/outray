import assert from "node:assert/strict";
import test from "node:test";
import {
  METRICS_RANGES,
  formatMetricChartTime,
  formatMetricCount,
  formatMetricDateTime,
  formatMetricType,
  formatMetricValue,
  latestMetricPoint,
  metricAggregationLabel,
  metricChartValueDomain,
  metricOptionDescription,
  metricOptionLabel,
  metricSampleCount,
  metricsSelectionMatches,
  metricValueUnit,
  normalizeMetricsSearch,
  parseMetricTimestamp,
  sortedMetricPoints,
  sortedMetricServiceValues,
  type MetricMetadata,
  type MetricPoint,
  type MetricsSnapshot,
} from "../src/components/observability/metrics-data";

const metric: MetricMetadata = {
  key: "latency:histogram:ms:delta", name: "http.duration", description: "HTTP response duration",
  unit: "ms", type: "histogram", aggregationTemporality: "delta", isMonotonic: false,
  firstSeen: "2026-10-05T00:00:00Z", lastSeen: "2026-10-05T01:00:00Z",
  dataPointCount: 100, serviceCount: 2, dimensions: ["http.route"],
};
const point = (timestamp: string, value: number, aggregation = "mean", sampleCount = 2): MetricPoint => ({
  timestamp, value, aggregation, sampleCount, type: "histogram",
});
const snapshot: MetricsSnapshot = {
  metrics: [metric], selectedMetric: metric, services: ["api"], points: [], breakdown: [],
  range: "1h", requestedRange: "1h", requestedMetricKey: metric.key, requestedService: "api", receivedAt: 100,
};

test("metric search validates only supported ranges and safely omits empty or all filters", () => {
  assert.deepEqual(METRICS_RANGES, ["1h", "6h", "24h", "7d", "30d"]);
  assert.deepEqual(normalizeMetricsSearch(), { range: "1h" });
  assert.deepEqual(normalizeMetricsSearch({ metric: "  duration\u00b5 ", service: " api & queue ", range: " 6h " }), {
    metric: "duration\u00b5", service: "api & queue", range: "6h",
  });
  for (const input of [null, undefined, 123, "7d", [], { metric: false, service: [], range: "90d" }, { metric: " ", service: "all", range: "24H" }]) {
    assert.deepEqual(normalizeMetricsSearch(input), { range: "1h" });
  }
  for (const range of METRICS_RANGES) assert.equal(normalizeMetricsSearch({ range }).range, range);
});

test("selection provenance matches the request, not the server's fallback metric", () => {
  assert.equal(metricsSelectionMatches(snapshot, { metric: metric.key, service: "api", range: "1h" }), true);
  assert.equal(metricsSelectionMatches(snapshot, { metric: metric.key, service: "api", range: "7d" }), false);
  assert.equal(metricsSelectionMatches(snapshot, { metric: metric.key, service: "worker", range: "1h" }), false);
  assert.equal(metricsSelectionMatches(snapshot, { metric: "missing", service: "api", range: "1h" }), false);
  assert.equal(metricsSelectionMatches({ ...snapshot, requestedMetricKey: "missing" }, { metric: "missing", service: "api", range: "1h" }), true);
});

test("Tinybird unzoned timestamps are UTC and impossible dates or local-only strings are rejected", () => {
  assert.equal(parseMetricTimestamp("2026-10-05 12:30:00"), Date.parse("2026-10-05T12:30:00Z"));
  assert.equal(parseMetricTimestamp("2026-10-05T12:30:00.123456Z"), Date.parse("2026-10-05T12:30:00.123Z"));
  assert.equal(parseMetricTimestamp("2026-10-05T13:30:00+0100"), Date.parse("2026-10-05T12:30:00Z"));
  assert.ok(Number.isNaN(parseMetricTimestamp("2026-02-30T12:30:00Z")));
  assert.ok(Number.isNaN(parseMetricTimestamp("yesterday")));
  assert.equal(formatMetricDateTime("bad"), "—");
  assert.equal(formatMetricChartTime("bad", "1h"), "—");
});

test("series sorting preserves real zero, negative gauges, mixed aggregation, and missing intervals", () => {
  const points = [
    point("2026-10-05T12:03:00Z", 100, "count"),
    point("2026-10-05T12:00:00Z", -2, "latest"),
    point("2026-10-05T12:01:00Z", 0, "latest"),
    point("bad", 0), point("2026-10-05T12:04:00Z", NaN),
    point("2026-10-05T12:05:00Z", null as unknown as number),
    point("2026-10-05T12:06:00Z", Infinity),
  ];
  const sorted = sortedMetricPoints(points);
  assert.deepEqual(sorted.map((item) => item.value), [-2, 0, 100]);
  assert.deepEqual(sorted.map((item) => item.aggregation), ["latest", "latest", "count"]);
  assert.equal(sorted.length, 3, "no value is fabricated for the unreported 12:02 interval");
  assert.equal(points[0].value, 100, "cache order is not mutated");
  assert.equal(latestMetricPoint(points)?.value, 100);
  assert.equal(latestMetricPoint([]), null);
});

test("sample counts count raw received records, not bucket values or histogram observations", () => {
  assert.equal(metricSampleCount([point("2026-10-05T12:00:00Z", 1000, "count", 4), point("2026-10-05T12:01:00Z", 0.12, "mean", 3)]), 7);
  assert.equal(metricSampleCount([]), 0);
  for (const count of [NaN, Infinity, -1, 1.25, null as unknown as number]) {
    assert.equal(metricSampleCount([point("2026-10-05T12:00:00Z", 0, "mean", count)]), null);
  }
  assert.equal(metricSampleCount([point("2026-10-05T12:00:00Z", 1, "count", Number.MAX_SAFE_INTEGER), point("2026-10-05T12:01:00Z", 1, "count", 1)]), null);
});

test("histogram means and scalar readings retain units while count fallback shows observations", () => {
  assert.equal(metricValueUnit("ms", "mean"), "ms");
  assert.equal(metricValueUnit("s", "count"), "observations");
  assert.equal(metricValueUnit("By", "delta_sum"), "By");
  assert.equal(metricValueUnit("{operation}", "cumulative"), "{operation}");
  assert.equal(formatMetricValue(-2, "Cel"), "-2 Cel");
  assert.equal(formatMetricValue(0, "ms"), "0 ms");
  assert.equal(formatMetricValue(null, "ms"), "—");
  assert.equal(formatMetricValue(NaN, "ms"), "—");
  assert.equal(formatMetricValue(0.00000000001, "s"), `${(0.00000000001).toLocaleString(undefined, { maximumSignificantDigits: 3 })} s`);
  assert.notEqual(formatMetricValue(0.00000000001, "s"), "0 s");
  assert.equal(formatMetricCount(0), "0");
  assert.equal(formatMetricCount(null), "—");
  assert.equal(formatMetricCount(-1), "—");
  assert.equal(formatMetricCount(2.1), "—");
});

test("metric descriptions disambiguate instruments with the same name without changing their keys", () => {
  assert.equal(metricOptionLabel(metric), "http.duration");
  assert.equal(metricOptionLabel(metric, true), "http.duration · Histogram · ms · Delta · non-monotonic");
  assert.match(metricOptionDescription(metric), /^HTTP response duration · Histogram · ms · Delta/);
  assert.match(metricOptionDescription({ ...metric, description: "", unit: "", isMonotonic: true }), /unitless.*monotonic/);
  assert.equal(formatMetricType("exponential_histogram"), "Exponential Histogram");
  assert.equal(metricAggregationLabel("count"), "Observations");
  assert.equal(metricAggregationLabel("delta_sum"), "Delta sum");
  assert.equal(typeof metricAggregationLabel("__proto__"), "string");
});

test("service breakdown sorting is stable and does not numerically compare means with counts", () => {
  const values = [
    { service: "worker", type: "gauge", value: -2, sampleCount: 1, lastSeen: "", aggregation: "latest" },
    { service: "api", type: "histogram", value: 1, sampleCount: 1, lastSeen: "", aggregation: "mean" },
    { service: "queue", type: "histogram", value: 1000, sampleCount: 1, lastSeen: "", aggregation: "count" },
    { service: "bad", type: "histogram", value: NaN, sampleCount: 1, lastSeen: "", aggregation: "mean" },
  ];
  assert.deepEqual(sortedMetricServiceValues(values).map((item) => item.service), ["api", "queue", "worker"]);
  assert.equal(sortedMetricServiceValues(values).at(-1)?.value, -2);
  assert.equal(values[0].service, "worker");
});

test("chart domains scale tiny measurements and stay finite for extremes and zero", () => {
  const datum = (value: number | null) => ({ time: 0, pointIndex: 0, value });
  assert.deepEqual(metricChartValueDomain([datum(null)]), [-1, 1]);
  assert.deepEqual(metricChartValueDomain([datum(0)]), [-1, 1]);
  const tiny = metricChartValueDomain([datum(0.00000001)]);
  assert.ok(tiny[0] > 0.000000009 && tiny[0] < 0.00000001);
  assert.ok(tiny[1] > 0.00000001 && tiny[1] < 0.000000011);
  for (const values of [[Number.MAX_VALUE], [-Number.MAX_VALUE], [-Number.MAX_VALUE, Number.MAX_VALUE], [Number.MIN_VALUE]]) {
    const domain = metricChartValueDomain(values.map(datum));
    assert.ok(domain.every(Number.isFinite));
    assert.ok(domain[0] < domain[1]);
  }
});
