import assert from "node:assert/strict";
import test from "node:test";
import {
  SERVICE_DETAIL_RANGES,
  buildServiceDetailUsage,
  formatServiceDetailCount,
  formatServiceDetailDuration,
  formatServiceDetailRate,
  formatServiceDetailThroughput,
  getServiceDetailNumberConfig,
  normalizeServiceDetailRange,
  type ServiceDetailRange,
} from "../src/components/observability/service-detail-data";
import type { ServiceTrafficPoint } from "../src/components/observability/overview-data";

const now = Date.parse("2026-10-05T12:15:00Z");
function point(timestamp: string, overrides: Partial<ServiceTrafficPoint> = {}): ServiceTrafficPoint {
  return { timestamp, operationCount: 100, errorCount: 2, errorRate: 2, p95Duration: 120, operationsPerMinute: 1, ...overrides };
}

test("service detail ranges include six hours and thirty days with a safe default", () => {
  assert.deepEqual(SERVICE_DETAIL_RANGES, ["1h", "6h", "24h", "7d", "30d"]);
  for (const range of SERVICE_DETAIL_RANGES) assert.equal(normalizeServiceDetailRange(range), range);
  for (const value of [undefined, null, "", "90d", "24H", ["6h"], 6]) assert.equal(normalizeServiceDetailRange(value), "24h");
});

test("each detail range follows the actual services API's completed bucket width", () => {
  const examples: [ServiceDetailRange, string, string][] = [
    ["1h", "2026-10-05T12:10:00Z", "2026-10-05T12:15:00.000Z"],
    ["6h", "2026-10-05T12:00:00Z", "2026-10-05T12:15:00.000Z"],
    ["24h", "2026-10-05T11:00:00Z", "2026-10-05T12:00:00.000Z"],
    ["7d", "2026-10-05T06:00:00Z", "2026-10-05T12:00:00.000Z"],
    ["30d", "2026-10-04T00:00:00Z", "2026-10-05T00:00:00.000Z"],
  ];
  for (const [range, timestamp, endTime] of examples) {
    const usage = buildServiceDetailUsage({ range, traffic: [point(timestamp)] }, now);
    assert.equal(usage.operations[0].endTime, endTime, range);
    const minutes = (Date.parse(endTime) - Date.parse(timestamp)) / 60_000;
    assert.equal(usage.throughput[0].value, 100 / minutes, range);
  }
});

test("complete received counts reduce to fourteen sorted bars without changing source data", () => {
  const traffic = Array.from({ length: 23 }, (_, index) => point(new Date(Date.parse("2026-10-04T13:00:00Z") + index * 3_600_000).toISOString(), { operationCount: index + 1, errorCount: 0 })).reverse();
  const original = traffic.slice();
  const usage = buildServiceDetailUsage({ range: "24h", traffic }, now);
  assert.equal(usage.operations.length, 14);
  assert.equal(usage.operations.reduce((sum, bar) => sum + (bar.value ?? 0), 0), 276);
  assert.equal(usage.operations[0].startTime, "2026-10-04T13:00:00.000Z");
  assert.equal(usage.operations.at(-1)?.endTime, "2026-10-05T12:00:00.000Z");
  for (const key of ["throughput", "errorRate", "p95"] as const) {
    assert.deepEqual(usage[key].map(({ startTime, endTime }) => [startTime, endTime]), usage.operations.map(({ startTime, endTime }) => [startTime, endTime]));
  }
  assert.deepEqual(traffic, original);
});

test("Tinybird UTC timestamps and explicit offsets sort by their actual instants", () => {
  const traffic = [
    point("2026-10-05 11:00:00.000000000", { operationCount: 3 }),
    point("2026-10-05T11:00:00+01:00", { operationCount: 2 }),
    point("2026-10-05 09:00:00", { operationCount: 1 }),
  ];
  const usage = buildServiceDetailUsage({ range: "24h", traffic }, now);
  assert.deepEqual(usage.operations.map((bar) => bar.value), [1, 2, 3]);
  assert.equal(usage.operations[0].startTime, "2026-10-05T09:00:00.000Z");
});

test("partial, future, out-of-range, invalid and unaligned intervals are excluded", () => {
  const traffic = [
    point("2026-10-04T12:00:00Z"), point("2026-10-04T13:00:00Z", { operationCount: 7 }),
    point("2026-10-05T11:00:00Z", { operationCount: 9 }), point("2026-10-05T12:00:00Z"),
    point("2026-10-05T13:00:00Z"), point("2026-10-05T11:30:00Z"), point("invalid"),
  ];
  assert.deepEqual(buildServiceDetailUsage({ range: "24h", traffic }, now).operations.map((bar) => bar.value), [7, 9]);
});

test("duplicate API bucket instants contribute once, with the latest received row", () => {
  const traffic = [point("2026-10-05T11:00:00Z", { operationCount: 5 }), point("2026-10-05 11:00:00", { operationCount: 7 })];
  assert.deepEqual(buildServiceDetailUsage({ range: "24h", traffic }, now).operations.map((bar) => bar.value), [7]);
});

test("throughput includes explicit empty intervals instead of averaging supplied rates", () => {
  const traffic = [
    point("2026-10-05T09:00:00Z", { operationCount: 60, operationsPerMinute: 999 }),
    point("2026-10-05T10:00:00Z", { operationCount: 0, errorCount: 0, p95Duration: null, operationsPerMinute: 999 }),
    point("2026-10-05T11:00:00Z", { operationCount: 120, operationsPerMinute: 999 }),
  ];
  const usage = buildServiceDetailUsage({ range: "24h", traffic }, now, 1);
  assert.equal(usage.operations[0].value, 180);
  assert.equal(usage.throughput[0].value, 1);
});

test("missing gaps are not explicit empty buckets or complete group aggregates", () => {
  const traffic = [point("2026-10-05T09:00:00Z", { operationCount: 60 }), point("2026-10-05T11:00:00Z", { operationCount: 120 })];
  assert.equal(buildServiceDetailUsage({ range: "24h", traffic }, now).operations.length, 2);
  const usage = buildServiceDetailUsage({ range: "24h", traffic }, now, 1);
  assert.equal(usage.operations[0].value, null);
  assert.equal(usage.throughput[0].value, null);
  assert.equal(usage.errorRate[0].value, null);
  assert.equal(usage.p95[0].value, 120);
  assert.equal(usage.throughput[0].startTime, "2026-10-05T09:00:00.000Z");
  assert.equal(usage.throughput[0].endTime, "2026-10-05T12:00:00.000Z");
});

test("error rates weight measured errors by operations, not by intervals", () => {
  const traffic = [
    point("2026-10-05T09:00:00Z", { operationCount: 1, errorCount: 1, errorRate: 100 }),
    point("2026-10-05T10:00:00Z", { operationCount: 999, errorCount: 0, errorRate: 0 }),
    point("2026-10-05T11:00:00Z", { operationCount: 0, errorCount: 0, errorRate: 0 }),
  ];
  assert.equal(buildServiceDetailUsage({ range: "24h", traffic }, now, 1).errorRate[0].value, 0.1);
});

test("legacy error rates are operation-weighted when errorCount is absent", () => {
  const traffic = [
    point("2026-10-05T10:00:00Z", { operationCount: 10, errorCount: undefined, errorRate: 50 }),
    point("2026-10-05T11:00:00Z", { operationCount: 90, errorCount: undefined, errorRate: 0 }),
  ];
  assert.equal(buildServiceDetailUsage({ range: "24h", traffic }, now, 1).errorRate[0].value, 5);
});

test("grouped P95 uses the latest observed interval, never an average or invented quantile", () => {
  const traffic = [
    point("2026-10-05T08:00:00Z", { p95Duration: 900 }), point("2026-10-05T09:00:00Z", { p95Duration: 10 }),
    point("2026-10-05T10:00:00Z", { p95Duration: 300 }),
    point("2026-10-05T11:00:00Z", { operationCount: 0, errorCount: 0, p95Duration: 0 }),
  ];
  assert.deepEqual(buildServiceDetailUsage({ range: "24h", traffic }, now, 2).p95.map((bar) => bar.value), [10, 300]);
});

test("observed zero latency differs from no operations and invalid latency", () => {
  for (const p95Duration of [null, NaN, Infinity, -1]) {
    assert.equal(buildServiceDetailUsage({ range: "24h", traffic: [point("2026-10-05T11:00:00Z", { p95Duration })] }, now).p95[0].value, null);
  }
  const observedZero = buildServiceDetailUsage({ range: "24h", traffic: [point("2026-10-05T11:00:00Z", { p95Duration: 0 })] }, now);
  assert.equal(observedZero.p95[0].value, 0);
  const empty = buildServiceDetailUsage({ range: "24h", traffic: [point("2026-10-05T11:00:00Z", { operationCount: 0, errorCount: 0, p95Duration: 0 })] }, now);
  assert.equal(empty.operations[0].value, 0);
  assert.equal(empty.throughput[0].value, 0);
  assert.equal(empty.errorRate[0].value, null);
  assert.equal(empty.p95[0].value, null);
});

test("invalid operation or error measurements remain missing evidence", () => {
  for (const operationCount of [NaN, Infinity, -1]) {
    const usage = buildServiceDetailUsage({ range: "24h", traffic: [point("2026-10-05T11:00:00Z", { operationCount })] }, now);
    for (const key of ["operations", "throughput", "errorRate", "p95"] as const) assert.equal(usage[key][0].value, null);
  }
  const usage = buildServiceDetailUsage({ range: "24h", traffic: [point("2026-10-05T11:00:00Z", { errorCount: NaN })] }, now);
  assert.equal(usage.operations[0].value, 100);
  assert.equal(usage.errorRate[0].value, null);
});

test("empty responses or invalid configuration create no invented measurements", () => {
  const empty = { operations: [], throughput: [], errorRate: [], p95: [] };
  assert.deepEqual(buildServiceDetailUsage({ range: "24h", traffic: [] }, now), empty);
  const data = { range: "24h", traffic: [point("2026-10-05T11:00:00Z")] };
  for (const limit of [0, -1, 1.5, NaN]) assert.deepEqual(buildServiceDetailUsage(data, now, limit), empty);
  for (const reference of [NaN, Infinity]) assert.deepEqual(buildServiceDetailUsage(data, reference), empty);
});

test("formatters and ticker configs share truthful count, rate, latency and per-minute units", () => {
  assert.equal(formatServiceDetailCount(123_456), "123,456");
  assert.equal(formatServiceDetailRate(1.234), "1.23%");
  assert.equal(formatServiceDetailDuration(125.3), "125ms");
  assert.equal(formatServiceDetailDuration(1_230), "1.23s");
  assert.equal(formatServiceDetailDuration(0), "0ms");
  assert.equal(formatServiceDetailThroughput(1.234), "1.23 /min");
  assert.equal(formatServiceDetailThroughput(0), "0 /min");
  for (const format of [formatServiceDetailCount, formatServiceDetailRate, formatServiceDetailDuration, formatServiceDetailThroughput]) {
    for (const value of [undefined, null, NaN, Infinity, -1]) assert.equal(format(value), "—");
  }
  assert.equal(getServiceDetailNumberConfig(1_230, "p95").value, 1.23);
  assert.equal(getServiceDetailNumberConfig(1.234, "throughput").format.maximumFractionDigits, 2);
  assert.equal(getServiceDetailNumberConfig(1.234, "throughput").suffix, " /min");
});
