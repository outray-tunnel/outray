import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTunnelMetricBars,
  finiteTunnelMetricValue,
  formatTunnelCount,
  getTunnelMetricNumberConfig,
} from "../src/components/tunnel-details/tunnel-overview-data";
import {
  formatBytes,
  formatDuration,
  formatPercent,
} from "../src/components/tunnel-details/tunnel-overview-format";
import type { OverviewChartPoint } from "../src/components/tunnel-details/tunnel-overview-ui";

const time = "2026-10-05T12:00:00Z";

test("only finite nonnegative numeric measurements are evidence", () => {
  for (const value of [undefined, null, "2", NaN, Infinity, -1, false]) {
    assert.equal(finiteTunnelMetricValue(value), null);
  }
  assert.equal(finiteTunnelMetricValue(0), 0);
  assert.equal(finiteTunnelMetricValue(12.3), 12.3);
});

test("each range retains the real API bucket width", () => {
  const examples = [
    ["1h", "2026-10-05T12:01:00.000Z"],
    ["24h", "2026-10-05T13:00:00.000Z"],
    ["7d", "2026-10-06T12:00:00.000Z"],
    ["30d", "2026-10-06T12:00:00.000Z"],
  ];
  for (const [range, expectedEnd] of examples) {
    const bars = buildTunnelMetricBars([{ time, requests: 1 }], "requests", range);
    assert.equal(bars[0].startTime, "2026-10-05T12:00:00.000Z");
    assert.equal(bars[0].endTime, expectedEnd);
  }
  assert.deepEqual(buildTunnelMetricBars([{ time, requests: 1 }], "requests", "90d"), []);
});

test("valid timestamps sort by instant without mutating input or bridging missing buckets", () => {
  const points = Object.freeze([
    Object.freeze({ time: "2026-10-05 14:00:00", requests: 3 }),
    Object.freeze({ time: "2026-10-05T13:00:00+01:00", requests: 1 }),
    Object.freeze({ time: "invalid", requests: 4 }),
  ]);
  assert.deepEqual(buildTunnelMetricBars(points, "requests", "24h"), [
    { startTime: "2026-10-05T12:00:00.000Z", endTime: "2026-10-05T13:00:00.000Z", value: 1 },
    { startTime: "2026-10-05T14:00:00.000Z", endTime: "2026-10-05T15:00:00.000Z", value: 3 },
  ]);
  assert.equal(points[0].time, "2026-10-05 14:00:00");
  assert.deepEqual(buildTunnelMetricBars([{ time: "+275760-09-13T00:00:00.000Z", requests: 1 }], "requests", "24h"), []);
});

test("missing or invalid fields stay unknown while explicit zero counts remain zero", () => {
  const points: OverviewChartPoint[] = [
    { time }, { time, requests: NaN }, { time, requests: -5 },
    { time, requests: Infinity }, { time, requests: 0 },
  ];
  assert.deepEqual(buildTunnelMetricBars(points, "requests", "1h").map(({ value }) => value), [null, null, null, null, 0]);
  assert.deepEqual(buildTunnelMetricBars(points, "bandwidth", "1h").map(({ value }) => value), [null, null, null, null, null]);
});

test("HTTP averages and rates require requests but measured zero rates and durations are retained", () => {
  const points: OverviewChartPoint[] = [
    { time, duration: 10, errorRate: 25 },
    { time, requests: 0, duration: 0, errorRate: 0 },
    { time, requests: 2, duration: 0, errorRate: 0 },
    { time, requests: 2, duration: 30, errorRate: 50 },
    { time, requests: 2 },
  ];
  assert.deepEqual(buildTunnelMetricBars(points, "duration", "24h").map(({ value }) => value), [null, null, 0, 30, null]);
  assert.deepEqual(buildTunnelMetricBars(points, "errorRate", "24h").map(({ value }) => value), [null, null, 0, 50, null]);
});

test("TCP duration respects closes and unavailable legacy averages", () => {
  const points: OverviewChartPoint[] = [
    { time, closes: 0, avgDurationMs: 10 },
    { time, closes: 1, avgDurationMs: 0 },
    { time, closes: 1, avgDurationMs: 30 },
    { time, avgDurationMs: 0 },
    { time, avgDurationMs: 40 },
    { time, closes: -1, avgDurationMs: 20 },
    { time, closes: 1 },
  ];
  assert.deepEqual(buildTunnelMetricBars(points, "avgDurationMs", "24h").map(({ value }) => value), [null, null, 30, null, 40, null, null]);
});

test("counts, rates and distinct clients preserve every received bucket without aggregation", () => {
  const points = Array.from({ length: 60 }, (_, index) => ({
    time: new Date(Date.parse(time) + index * 60_000).toISOString(),
    requests: index + 1,
    duration: 100 - index,
    errorRate: index % 5,
    uniqueClients: 1,
    uniqueConnections: 2,
  }));
  for (const key of ["requests", "duration", "errorRate", "uniqueClients", "uniqueConnections"] as const) {
    const bars = buildTunnelMetricBars(points, key, "1h");
    assert.equal(bars.length, 60);
    assert.deepEqual(bars.map(({ value }) => value), points.map((point) => point[key]));
  }
});

function animatedNumber(value: number, kind: Parameters<typeof getTunnelMetricNumberConfig>[1]): string {
  const config = getTunnelMetricNumberConfig(value, kind);
  return new Intl.NumberFormat("en-US", config.format).format(config.value) + config.suffix;
}

test("animated counts and byte values match the static format including precision and unit thresholds", () => {
  for (const value of [0, 1, 12.4, 12.9, 1023.6, 1024, 1536, 1_048_576, 1_073_741_824]) {
    assert.equal(animatedNumber(value, "count"), formatTunnelCount(value));
    assert.equal(animatedNumber(value, "bytes"), formatBytes(value));
  }
});

test("animated duration and percent values match the static formatter", () => {
  for (const value of [0, 0.25, 12.9, 999.6, 1000, 1550, 60000, 75000]) {
    assert.equal(animatedNumber(value, "duration"), formatDuration(value));
  }
  for (const value of [0, 0.333, 9.995, 10, 10.555, 100]) {
    assert.equal(animatedNumber(value, "percent"), formatPercent(value));
  }
});
