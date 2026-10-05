import assert from "node:assert/strict";
import test from "node:test";
import {
  buildObservabilityUsage,
  formatCount,
  formatDuration,
  formatErrorRate,
  getLatestP95,
  getObservabilityNumberConfig,
  normalizeObservabilityRange,
  type ObservabilityRange,
  type ServiceTrafficPoint,
} from "../src/components/observability/overview-data";

const now = Date.parse("2026-10-05T12:15:00Z");
function point(timestamp: string, overrides: Partial<ServiceTrafficPoint> = {}): ServiceTrafficPoint {
  return { timestamp, operationCount: 100, errorCount: 2, errorRate: 2, p95Duration: 120, operationsPerMinute: 1, ...overrides };
}

test("overview range validation accepts only the four shared dashboard ranges", () => {
  for (const value of ["1h", "24h", "7d", "30d"] as const) assert.equal(normalizeObservabilityRange(value), value);
  for (const value of [undefined, null, "6h", "90d", "", "24H", ["7d"], 7]) assert.equal(normalizeObservabilityRange(value), "24h");
});

test("operation mini-bars sum all complete received counts in chronological order", () => {
  const traffic = Array.from({ length: 23 }, (_, index) => point(new Date(Date.parse("2026-10-04T13:00:00Z") + index * 3_600_000).toISOString(), { operationCount: index + 1, errorCount: 0 }));
  const usage = buildObservabilityUsage({ range: "24h", traffic: traffic.slice().reverse() }, now);
  assert.equal(usage.operations.length, 14);
  assert.equal(usage.operations.reduce((sum, bar) => sum + (bar.value ?? 0), 0), 276);
  assert.equal(usage.operations[0].startTime, "2026-10-04T13:00:00.000Z");
  assert.equal(usage.operations.at(-1)?.endTime, "2026-10-05T12:00:00.000Z");
  for (const key of ["errorRate", "p95"] as const) assert.deepEqual(usage[key].map(({ startTime, endTime }) => [startTime, endTime]), usage.operations.map(({ startTime, endTime }) => [startTime, endTime]));
});

test("partial, future, out-of-range, invalid and unaligned buckets do not enter the mini-charts", () => {
  const traffic = [
    point("2026-10-04T12:00:00Z"),
    point("2026-10-04T13:00:00Z", { operationCount: 7 }),
    point("2026-10-05T11:00:00Z", { operationCount: 9 }),
    point("2026-10-05T12:00:00Z"),
    point("2026-10-05T13:00:00Z"),
    point("2026-10-05T11:30:00Z"),
    point("invalid"),
  ];
  const usage = buildObservabilityUsage({ range: "24h", traffic }, now);
  assert.deepEqual(usage.operations.map((bar) => bar.value), [7, 9]);
});

test("error mini-bars weight errors by operations, never by number of intervals", () => {
  const traffic = [
    point("2026-10-05T09:00:00Z", { operationCount: 1, errorCount: 1, errorRate: 100 }),
    point("2026-10-05T10:00:00Z", { operationCount: 999, errorCount: 0, errorRate: 0 }),
    point("2026-10-05T11:00:00Z", { operationCount: 0, errorCount: 0, errorRate: 0 }),
  ];
  const usage = buildObservabilityUsage({ range: "24h", traffic }, now, 1);
  assert.equal(usage.operations[0].value, 1_000);
  assert.equal(usage.errorRate[0].value, 0.1);
});

test("legacy traffic without error counts still uses operation-weighted error rate", () => {
  const traffic = [
    point("2026-10-05T10:00:00Z", { operationCount: 10, errorCount: undefined, errorRate: 50 }),
    point("2026-10-05T11:00:00Z", { operationCount: 90, errorCount: undefined, errorRate: 0 }),
  ];
  assert.equal(buildObservabilityUsage({ range: "24h", traffic }, now, 1).errorRate[0].value, 5);
});

test("latency uses the latest observed percentile within each display interval, never an average", () => {
  const traffic = [
    point("2026-10-05T08:00:00Z", { p95Duration: 900 }),
    point("2026-10-05T09:00:00Z", { p95Duration: 10 }),
    point("2026-10-05T10:00:00Z", { p95Duration: 300 }),
    point("2026-10-05T11:00:00Z", { operationCount: 0, errorCount: 0, p95Duration: null }),
  ];
  const usage = buildObservabilityUsage({ range: "24h", traffic }, now, 2);
  assert.deepEqual(usage.p95.map((bar) => bar.value), [10, 300]);
  assert.equal(getLatestP95({ range: "24h", traffic: traffic.slice().reverse() }, now), 300);
});

test("no recorded operations cannot imply zero latency or an observed zero error rate", () => {
  const traffic = [point("2026-10-05T11:00:00Z", { operationCount: 0, errorCount: 0, errorRate: 0, p95Duration: 0 })];
  const usage = buildObservabilityUsage({ range: "24h", traffic }, now);
  assert.equal(usage.operations[0].value, 0);
  assert.equal(usage.errorRate[0].value, null);
  assert.equal(usage.p95[0].value, null);
  assert.equal(getLatestP95({ range: "24h", traffic }, now), null);
});

test("an observed zero latency remains distinct from missing latency", () => {
  const traffic = [point("2026-10-05T11:00:00Z", { p95Duration: 0 })];
  assert.equal(buildObservabilityUsage({ range: "24h", traffic }, now).p95[0].value, 0);
  assert.equal(getLatestP95({ range: "24h", traffic }, now), 0);
});

test("all four ranges use the services API's correct interval boundaries", () => {
  const examples: [ObservabilityRange, string, string][] = [
    ["1h", "2026-10-05T12:05:00Z", "2026-10-05T12:10:00.000Z"],
    ["24h", "2026-10-05T11:00:00Z", "2026-10-05T12:00:00.000Z"],
    ["7d", "2026-10-05T06:00:00Z", "2026-10-05T12:00:00.000Z"],
    ["30d", "2026-10-04T00:00:00Z", "2026-10-05T00:00:00.000Z"],
  ];
  for (const [range, timestamp, endTime] of examples) {
    const usage = buildObservabilityUsage({ range, traffic: [point(timestamp)] }, now);
    assert.equal(usage.operations[0].endTime, endTime, range);
  }
});

test("empty responses and invalid display configuration create no invented data", () => {
  assert.deepEqual(buildObservabilityUsage({ range: "24h", traffic: [] }, now), { operations: [], errorRate: [], p95: [] });
  for (const limit of [0, -1, 1.5, NaN]) assert.deepEqual(buildObservabilityUsage({ range: "24h", traffic: [point("2026-10-05T11:00:00Z")] }, now, limit).operations, []);
  assert.equal(getLatestP95({ range: "24h", traffic: [] }, now), null);
});

test("formatters and NumberFlow configs share readable count, percentage and duration units", () => {
  assert.equal(formatCount(123_456), "123,456");
  assert.equal(formatErrorRate(1.234), "1.23%");
  assert.equal(formatDuration(125.3), "125ms");
  assert.equal(formatDuration(1_230), "1.23s");
  assert.equal(formatDuration(0), "0ms");
  for (const formatter of [formatCount, formatErrorRate, formatDuration]) {
    assert.equal(formatter(null), "—");
    assert.equal(formatter(NaN), "—");
  }
  assert.equal(getObservabilityNumberConfig(1_230, "p95").value, 1.23);
  assert.equal(getObservabilityNumberConfig(1_230, "p95").suffix, "s");
  assert.equal(getObservabilityNumberConfig(99, "p95").suffix, "ms");
  assert.equal(getObservabilityNumberConfig(1.234, "errorRate").format.maximumFractionDigits, 2);
});
