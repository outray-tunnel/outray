import assert from "node:assert/strict";
import test from "node:test";
import {
  LOG_RANGES, formatLogDateTime, formatLogISO, formatLogTime,
  logAttributes, logIdentity, logLevelDisplay, logRawJson,
  logsSelectionMatches, normalizeLogsSearch, parseLogTimestamp, sortedLogs,
  type LogEvent, type LogsSnapshot,
} from "../src/components/observability/logs-data";

const event = (id: string, timestamp = "2026-10-05 12:30:00"): LogEvent => ({
  id, timestamp, observedTimestamp: "2026-10-05 12:30:01", level: "info",
  severityNumber: 9, severityText: "INFO", message: "Payment received", eventName: "payment.received",
  traceId: "trace-a", spanId: "span-a", flags: 1, service: "payments-worker", serviceNamespace: "billing",
  serviceVersion: "1.2.3", environment: "production", region: "eu-west", scopeName: "payments", scopeVersion: "2.0",
  attributes: { "payment.id": "a" }, resourceAttributes: { "host.name": "edge" }, scopeAttributes: { "scope.attr": "value" },
});

test("logs search validates ranges and severity while keeping real service names", () => {
  assert.deepEqual(LOG_RANGES, ["1h", "6h", "24h", "7d", "30d"]);
  assert.deepEqual(normalizeLogsSearch(), { range: "1h" });
  assert.deepEqual(normalizeLogsSearch({ search: " payment & trace ", service: " all ", level: " warn ", range: " 6h " }), {
    search: "payment & trace", service: "all", level: "warn", range: "6h",
  });
  for (const input of [null, false, 123, [], "7d", { search: false, service: [], level: "fatal", range: "90d" }, { search: " ", service: " ", level: "__proto__", range: "24H" }]) {
    assert.deepEqual(normalizeLogsSearch(input), { range: "1h" });
  }
  for (const range of LOG_RANGES) assert.equal(normalizeLogsSearch({ range }).range, range);
  for (const level of ["debug", "info", "warn", "error"]) assert.equal(normalizeLogsSearch({ level }).level, level);
  assert.equal(normalizeLogsSearch({ level: "ERROR" }).level, undefined);
});

test("retained snapshot provenance distinguishes search, service, severity, and range changes", () => {
  const search = { search: "payment", service: "payments-worker", level: "warn" as const, range: "6h" as const };
  const snapshot: LogsSnapshot = { logs: [], services: [], range: "6h", receivedAt: 100, requestedSearch: search };
  assert.equal(logsSelectionMatches(snapshot, search), true);
  assert.equal(logsSelectionMatches(snapshot, { ...search, search: "payment error" }), false);
  assert.equal(logsSelectionMatches(snapshot, { ...search, service: "api" }), false);
  assert.equal(logsSelectionMatches(snapshot, { ...search, level: "error" }), false);
  assert.equal(logsSelectionMatches(snapshot, { ...search, range: "7d" }), false);
  assert.equal(logsSelectionMatches(snapshot, { ...search, search: " payment " }), true);
});

test("Tinybird timestamps parse in UTC, including offsets, while malformed dates remain unknown", () => {
  assert.equal(parseLogTimestamp("2026-10-05 12:30:00"), Date.parse("2026-10-05T12:30:00Z"));
  assert.equal(parseLogTimestamp("2026-10-05T12:30:00.123456Z"), Date.parse("2026-10-05T12:30:00.123Z"));
  assert.equal(parseLogTimestamp("2026-10-05T13:30:00+0100"), Date.parse("2026-10-05T12:30:00Z"));
  assert.equal(parseLogTimestamp("2026-10-05T11:30:00-01:00"), Date.parse("2026-10-05T12:30:00Z"));
  for (const timestamp of ["2026-02-30T12:30:00Z", "2026-10-05T24:30:00Z", "2026-10-05T12:30:00+25:00", "yesterday", "2026-10-05", null as unknown as string]) {
    assert.ok(Number.isNaN(parseLogTimestamp(timestamp)));
    assert.equal(formatLogTime(timestamp), "—");
    assert.equal(formatLogTime(timestamp, true), "—");
    assert.equal(formatLogDateTime(timestamp), "—");
    assert.equal(formatLogISO(timestamp), "");
  }
  assert.equal(formatLogISO("2026-10-05 12:30:00"), "2026-10-05T12:30:00.000Z");
  assert.match(formatLogTime("2026-10-05 12:30:00"), /^\d{2}:\d{2}:\d{2}$/);
  assert.match(formatLogTime("2026-10-05 12:30:00.123456", true), /^\d{2}:\d{2}:\d{2}\.123$/);
  assert.match(formatLogTime("2026-10-05 12:30:00.007000", true), /^\d{2}:\d{2}:\d{2}\.007$/);
  assert.match(formatLogTime("2026-10-05 12:30:00", true), /^\d{2}:\d{2}:\d{2}\.000$/);
  assert.notEqual(formatLogDateTime("2026-10-05 12:30:00"), "—");
});

test("logs sort newest first with deterministic ties without dropping invalid events or mutating cache", () => {
  const logs = [event("z", "bad"), event("b"), event("a"), event("latest", "2026-10-05 12:31:00"), event("a", "invalid")];
  assert.deepEqual(sortedLogs(logs).map((item) => item.id), ["latest", "a", "b", "a", "z"]);
  assert.equal(logs[0].id, "z");
  assert.equal(sortedLogs([]).length, 0);
  assert.notEqual(logIdentity(event("a")), logIdentity(event("a", "2026-10-05 12:30:01")));
  assert.notEqual(logIdentity(event("a")), logIdentity(event("b")));
  assert.equal(logIdentity(event("a")), logIdentity({ ...event("a"), message: "updated" }));
});

test("levels use known colors without manufacturing an info severity for unknown events", () => {
  assert.deepEqual(logLevelDisplay({ level: "debug", severityText: "DEBUG" }), { level: "debug", label: "Debug", tone: "zinc" });
  assert.deepEqual(logLevelDisplay({ level: " INFO ", severityText: "INFO" }), { level: "info", label: "Info", tone: "sky" });
  assert.deepEqual(logLevelDisplay({ level: "warn", severityText: "WARNING" }), { level: "warn", label: "Warning", tone: "amber" });
  assert.deepEqual(logLevelDisplay({ level: "error", severityText: "ERROR" }), { level: "error", label: "Error", tone: "rose" });
  assert.deepEqual(logLevelDisplay({ level: "fatal", severityText: "FATAL" }), { level: "unknown", label: "FATAL", tone: "zinc" });
  assert.deepEqual(logLevelDisplay({ level: "__proto__", severityText: "" }), { level: "unknown", label: "Unknown", tone: "zinc" });
  assert.equal(logLevelDisplay({ level: "", severityText: "x".repeat(1000) }).label, `${"x".repeat(31)}…`);
});

test("structured attributes preserve meaningful primitive and nested values and tolerate malformed maps", () => {
  assert.deepEqual(logAttributes({ string: "value", zero: 0, bool: false, nothing: null, array: [1, "two"], nested: { a: true }, missing: undefined }), [
    { key: "string", value: "value" }, { key: "zero", value: "0" }, { key: "bool", value: "false" },
    { key: "nothing", value: "null" }, { key: "array", value: '[1,"two"]' },
    { key: "nested", value: '{"a":true}' }, { key: "missing", value: "undefined" },
  ]);
  for (const input of [null, undefined, "bad", 1, [1, 2]]) assert.deepEqual(logAttributes(input), []);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.deepEqual(logAttributes({ cyclic, bigint: 1n }), [
    { key: "cyclic", value: "[Unserializable value]" }, { key: "bigint", value: "[Unserializable value]" },
  ]);
  const prototypeKey = JSON.parse('{"__proto__":"safe","constructor":false}');
  assert.deepEqual(logAttributes(prototypeKey), [{ key: "__proto__", value: "safe" }, { key: "constructor", value: "false" }]);
});

test("raw JSON retains every API field and full attribute values, not condensed UI metadata", () => {
  const log = event("complete");
  assert.deepEqual(JSON.parse(logRawJson(log)), log);
  assert.equal(JSON.parse(logRawJson(log)).resourceAttributes["host.name"], "edge");
  assert.equal(JSON.parse(logRawJson(log)).scopeAttributes["scope.attr"], "value");
  assert.equal(JSON.parse(logRawJson(log)).observedTimestamp, log.observedTimestamp);
});
