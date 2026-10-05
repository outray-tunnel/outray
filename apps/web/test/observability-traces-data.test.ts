import assert from "node:assert/strict";
import test from "node:test";
import {
  TRACE_RANGES, formatTraceCount, formatTraceDateTime, formatTraceDuration,
  formatTraceISO, formatTracePercentage, formatTraceRate, formatTraceTime,
  normalizeTracesSearch, parseTraceTimestamp, sortedTraces, traceIdentity,
  traceStatusDisplay, traceWaterfallGeometry, tracesSelectionMatches,
  type TraceSummary, type TracesSnapshot,
} from "../src/components/observability/traces-data";

const trace = (id: string, startedAt = "2026-10-05 12:30:00"): TraceSummary => ({
  id, name: "POST /payments", rootService: "payments-worker", startedAt,
  duration: 180, spanCount: 4, status: "ok", method: "POST", spans: [],
});

test("traces normalize optional direct-link search and all five valid ranges", () => {
  assert.deepEqual(TRACE_RANGES, ["1h", "6h", "24h", "7d", "30d"]);
  assert.deepEqual(normalizeTracesSearch(), { range: "1h" });
  assert.deepEqual(normalizeTracesSearch({ search: " trace + & id ", range: " 24h ", errorsOnly: true }), {
    search: "trace + & id", range: "24h", errorsOnly: true,
  });
  for (const range of TRACE_RANGES) assert.equal(normalizeTracesSearch({ range }).range, range);
  for (const value of [null, [], "7d", false, 1, { search: " ", range: "90d", errorsOnly: false }, { search: [], range: false, errorsOnly: [] }]) {
    assert.deepEqual(normalizeTracesSearch(value), { range: "1h" });
  }
  assert.deepEqual(normalizeTracesSearch({ errorsOnly: "true" }), { errorsOnly: true, range: "1h" });
  for (const errorsOnly of ["false", "TRUE", " true ", 1, "1", false, null]) {
    assert.deepEqual(normalizeTracesSearch({ errorsOnly }), { range: "1h" });
  }
});

test("retained trace selection labels distinguish the filters that produced the evidence", () => {
  const snapshot: TracesSnapshot = {
    traces: [trace("a")], statistics: { totalTraces: 10, errorTraces: 3, errorRate: 30, p95Duration: 800, longestDuration: 900 },
    distribution: [{ bucket: "100-250", count: 2 }], range: "24h", receivedAt: 100,
    requestedSearch: { search: "payments", errorsOnly: true, range: "24h" },
  };
  assert.equal(tracesSelectionMatches(snapshot, snapshot.requestedSearch), true);
  assert.equal(tracesSelectionMatches(snapshot, { ...snapshot.requestedSearch, search: " payments " }), true);
  assert.equal(tracesSelectionMatches(snapshot, { ...snapshot.requestedSearch, search: "users" }), false);
  assert.equal(tracesSelectionMatches(snapshot, { ...snapshot.requestedSearch, errorsOnly: false }), false);
  assert.equal(tracesSelectionMatches(snapshot, { ...snapshot.requestedSearch, range: "7d" }), false);
});

test("trace timestamps preserve UTC and fractional precision instead of treating Tinybird dates as local", () => {
  assert.equal(parseTraceTimestamp("2026-10-05 12:30:00"), Date.parse("2026-10-05T12:30:00Z"));
  assert.equal(parseTraceTimestamp("2026-10-05 12:30:00.123456"), Date.parse("2026-10-05T12:30:00.123Z"));
  assert.equal(parseTraceTimestamp("2026-10-05T13:30:00+0100"), Date.parse("2026-10-05T12:30:00Z"));
  assert.match(formatTraceTime("2026-10-05 12:30:00"), /^\d{2}:\d{2}:\d{2}$/);
  assert.match(formatTraceTime("2026-10-05 12:30:00.007000", true), /^\d{2}:\d{2}:\d{2}\.007$/);
  assert.equal(formatTraceISO("2026-10-05 12:30:00"), "2026-10-05T12:30:00.000Z");
  assert.notEqual(formatTraceDateTime("2026-10-05 12:30:00"), "—");
  for (const value of ["2026-02-30 12:30:00", "2026-10-05T24:30:00Z", "2026-10-05", "bad", null as unknown as string]) {
    assert.ok(Number.isNaN(parseTraceTimestamp(value)));
    assert.equal(formatTraceTime(value), "—");
    assert.equal(formatTraceTime(value, true), "—");
    assert.equal(formatTraceDateTime(value), "—");
    assert.equal(formatTraceISO(value), "");
  }
});

test("sorting is deterministic, preserves malformed rows, and does not mutate the cache", () => {
  const traces = [trace("z", "bad"), trace("b"), trace("a"), trace("latest", "2026-10-05 12:31:00"), trace("a", "invalid")];
  assert.deepEqual(sortedTraces(traces).map((item) => item.id), ["latest", "a", "b", "a", "z"]);
  assert.equal(traces[0].id, "z");
  assert.deepEqual(sortedTraces([]), []);
  assert.notEqual(traceIdentity(trace("a")), traceIdentity(trace("b")));
  assert.notEqual(traceIdentity(trace("a")), traceIdentity(trace("a", "2026-10-05 12:30:01")));
  assert.equal(traceIdentity(trace("a")), traceIdentity({ ...trace("a"), name: "updated name" }));
});

test("duration formatting keeps unknown values distinct from actual zero and small measurements", () => {
  assert.equal(formatTraceDuration(0), "0 ms");
  assert.equal(formatTraceDuration(0.00012), "0.00012 ms");
  assert.equal(formatTraceDuration(12.345), "12.35 ms");
  assert.equal(formatTraceDuration(999), "999 ms");
  assert.equal(formatTraceDuration(1_250), "1.25 s");
  assert.equal(formatTraceDuration(60_000), "1m");
  assert.equal(formatTraceDuration(73_000), "1m 13s");
  for (const value of [NaN, Infinity, -Infinity, -1, null as unknown as number, "10" as unknown as number]) {
    assert.equal(formatTraceDuration(value), "—");
  }
});

test("counts and rates never replace invalid or impossible measurements with zero", () => {
  assert.equal(formatTraceCount(0), "0");
  assert.equal(formatTraceCount(1_234), "1,234");
  assert.equal(formatTraceRate(0), "0%");
  assert.equal(formatTraceRate(12.345), "12.35%");
  assert.equal(formatTraceRate(100), "100%");
  assert.equal(formatTracePercentage(12.345), formatTraceRate(12.345));
  for (const value of [NaN, Infinity, -1, null as unknown as number]) {
    assert.equal(formatTraceCount(value), "—");
    assert.equal(formatTraceRate(value), "—");
  }
  assert.equal(formatTraceCount(1.5), "—");
  assert.equal(formatTraceCount(Number.MAX_SAFE_INTEGER + 1), "—");
  assert.equal(formatTraceRate(101), "—");
});

test("trace status remains neutral for unknown values instead of falsely implying success", () => {
  assert.deepEqual(traceStatusDisplay(" ok "), { status: "ok", label: "OK", tone: "emerald" });
  assert.deepEqual(traceStatusDisplay("ERROR"), { status: "error", label: "Error", tone: "rose" });
  for (const status of ["", "unset", "__proto__", null as unknown as string]) {
    assert.deepEqual(traceStatusDisplay(status), { status: "unknown", label: "Unknown", tone: "zinc" });
  }
});

test("waterfalls clip actual measured boundaries without inventing duration for zero or unknown spans", () => {
  assert.deepEqual(traceWaterfallGeometry({ offset: 20, duration: 30 }, 100), { left: 20, width: 30 });
  assert.deepEqual(traceWaterfallGeometry({ offset: -20, duration: 30 }, 100), { left: 0, width: 10 });
  assert.deepEqual(traceWaterfallGeometry({ offset: 80, duration: 50 }, 100), { left: 80, width: 19.999999999999996 });
  assert.deepEqual(traceWaterfallGeometry({ offset: 120, duration: 50 }, 100), { left: 100, width: 0 });
  assert.deepEqual(traceWaterfallGeometry({ offset: 20, duration: 0 }, 100), { left: 20, width: 0 });
  assert.equal(traceWaterfallGeometry({ offset: 0, duration: 1 }, 0), null);
  assert.equal(traceWaterfallGeometry({ offset: NaN, duration: 1 }, 100), null);
  assert.equal(traceWaterfallGeometry({ offset: 0, duration: Infinity }, 100), null);
  assert.equal(traceWaterfallGeometry({ offset: 0, duration: -1 }, 100), null);
  assert.equal(traceWaterfallGeometry({ offset: 0, duration: 1 }, Infinity), null);
  for (const span of [{ offset: Number.MAX_VALUE, duration: Number.MAX_VALUE }, { offset: -Number.MAX_VALUE, duration: Number.MAX_VALUE }]) {
    const geometry = traceWaterfallGeometry(span, Number.MIN_VALUE)!;
    assert.ok(Number.isFinite(geometry.left) && geometry.left >= 0 && geometry.left <= 100);
    assert.ok(Number.isFinite(geometry.width) && geometry.width >= 0 && geometry.width <= 100);
  }
});
