import assert from "node:assert/strict";
import test from "node:test";
import {
  createUsageBars,
  formatUsageInterval,
  type UsagePoint,
} from "../src/components/overview/usage-bars";

const points: UsagePoint[] = Array.from({ length: 31 }, (_, index) => ({
  time: new Date(Date.UTC(2026, 9, 1, index)).toISOString(),
  httpRequests: index + 1,
  protocolEvents: index * 2,
  bandwidth: index * 1024,
  errors: index % 3,
}));

test("miniature usage bars preserve every metric total while combining contiguous buckets", () => {
  for (const key of [
    "httpRequests",
    "protocolEvents",
    "bandwidth",
    "errors",
  ] as const) {
    const bars = createUsageBars(points, key, "24h");
    assert.equal(bars.length, 14);
    assert.equal(
      bars.reduce((sum, bar) => sum + bar.value, 0),
      points.reduce((sum, point) => sum + point[key], 0),
    );
    assert.equal(bars[0].startTime, points[0].time);
    assert.equal(
      bars.at(-1)?.endTime,
      new Date(Date.parse(points.at(-1)!.time) + 3_600_000).toISOString(),
    );
    for (let index = 1; index < bars.length; index += 1) {
      assert.equal(bars[index - 1].endTime, bars[index].startTime);
    }
  }
});

test("small series are not padded with invented activity and dense zero series stay zero", () => {
  assert.deepEqual(createUsageBars([], "httpRequests", "1h"), []);
  const bars = createUsageBars(points.slice(0, 2), "httpRequests", "24h");
  assert.deepEqual(
    bars.map((bar) => bar.value),
    [1, 2],
  );
  const zero = points.map((point) => ({ ...point, httpRequests: 0 }));
  assert.ok(
    createUsageBars(zero, "httpRequests", "24h").every(
      (bar) => bar.value === 0,
    ),
  );
});

test("usage intervals clip partial edge buckets to the actual requested window", () => {
  const windowStart = "2026-10-01T00:15:00.000Z";
  const windowEnd = "2026-10-01T02:30:00.000Z";
  const bars = createUsageBars(
    points.slice(0, 3),
    "httpRequests",
    "24h",
    windowStart,
    windowEnd,
  );
  assert.equal(bars[0].startTime, windowStart);
  assert.equal(bars.at(-1)?.endTime, windowEnd);
  assert.equal(
    bars.reduce((sum, bar) => sum + bar.value, 0),
    6,
  );
});

test("bar generation orders a copy and safely ignores malformed timestamps/counts", () => {
  const input = [points[2], { ...points[1], time: "invalid" }, points[0]];
  const original = [...input];
  const bars = createUsageBars(input, "httpRequests", "24h");
  assert.deepEqual(input, original);
  assert.deepEqual(
    bars.map((bar) => bar.value),
    [1, 3],
  );
  const malformed = [
    { ...points[0], httpRequests: NaN },
    { ...points[1], httpRequests: -10 },
  ];
  assert.ok(
    createUsageBars(malformed, "httpRequests", "24h").every(
      (bar) => bar.value === 0,
    ),
  );
  assert.deepEqual(
    createUsageBars(points, "httpRequests", "24h", undefined, undefined, 0),
    [],
  );
});

test("daily tooltip labels do not attribute an exclusive midnight endpoint to another day", () => {
  // Local dates make this stable without relying on the execution host's timezone.
  const start = new Date(2026, 9, 1);
  const end = new Date(2026, 9, 2);
  const label = formatUsageInterval(
    { startTime: start.toISOString(), endTime: end.toISOString(), value: 1 },
    "7d",
  );
  assert.equal(
    label,
    start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  );
});
