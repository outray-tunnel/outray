import assert from "node:assert/strict";
import test from "node:test";
import { ALERT_STATES, alertServiceOptions, conditionLabel, filterAlerts, formatAlertValue, formatRelativeTime, formatWindow, getEffectiveState, normalizeAlertsSearch, summarizeAlerts } from "../src/components/observability/alerts-data";
import { alertFixture, alertsSnapshot } from "./fixtures/observability-alert";

test("alert list search validation strips invalid values and omitted defaults", () => {
  assert.deepEqual(normalizeAlertsSearch({ search: "  checkout  ", service: " queue ", signal: "metric_value", state: "firing", unknown: "ignored" }), { search: "checkout", service: "queue", signal: "metric_value", state: "firing" });
  for (const input of [null, false, [], "rule", { search: [], service: 123, signal: "other", state: "operational" }, { search: " ", service: " " }]) assert.deepEqual(normalizeAlertsSearch(input), {});
  assert.equal(normalizeAlertsSearch({ search: "x".repeat(300), service: "y".repeat(300) }).search?.length, 200);
  for (const state of ALERT_STATES) assert.equal(normalizeAlertsSearch({ state }).state, state);
});

test("rule filters combine and search complete names, descriptions, scopes and signals", () => {
  assert.deepEqual(filterAlerts(alertsSnapshot.alerts, { search: "CHECKOUT" }).map((alert) => alert.id), ["rule-a", "rule-b"]);
  assert.deepEqual(filterAlerts(alertsSnapshot.alerts, { search: "queue.depth", service: "queue", signal: "metric_value", state: "healthy" }).map((alert) => alert.id), ["rule-b"]);
  assert.equal(filterAlerts(alertsSnapshot.alerts, { service: "queue", state: "firing" }).length, 0);
  assert.deepEqual(filterAlerts(alertsSnapshot.alerts, { search: "5xx" }).map((alert) => alert.id), ["rule-a"]);
  const allRules = Array.from({ length: 200 }, (_, index) => alertFixture({ id: `rule-${index}`, name: `Rule ${index}` }));
  assert.deepEqual(filterAlerts(allRules, { search: "Rule 199" }).map((alert) => alert.id), ["rule-199"]);
});

test("effective state preserves pause precedence, mute semantics and underlying status", () => {
  assert.equal(getEffectiveState(alertFixture({ enabled: false, state: "muted", mutedUntil: "2099-10-05T12:00:00Z" })), "paused");
  assert.equal(getEffectiveState(alertFixture({ state: "healthy", mutedUntil: "2099-10-05T12:00:00Z" })), "muted");
  assert.equal(getEffectiveState(alertFixture({ state: "firing", mutedUntil: "2020-10-05T12:00:00Z" })), "firing");
  assert.equal(filterAlerts([alertFixture({ enabled: false })], { state: "paused" }).length, 1);
  assert.equal(filterAlerts([alertFixture({ enabled: false })], { state: "firing" }).length, 0);
});

test("service catalog merges both response formats and selected missing services", () => {
  assert.deepEqual(alertServiceOptions(alertsSnapshot, "archived"), ["archived", "payments-worker", "queue"]);
  assert.deepEqual(alertServiceOptions(undefined, "ghost"), ["ghost"]);
});

test("each state is counted exactly once when locally adding a new rule", () => {
  const alerts = ALERT_STATES.map((state) => alertFixture({ id: state, state, enabled: state !== "paused" }));
  assert.deepEqual(summarizeAlerts(alerts), { total: 7, firing: 1, healthy: 1, pending: 1, error: 1, muted: 1, noData: 1, paused: 1 });
});

test("all six signal conditions retain meaningful units and missing values", () => {
  assert.equal(formatAlertValue(8.25, alertFixture()), "8.25%");
  assert.equal(formatAlertValue(1500, alertFixture({ signal: "request_latency_p95" })), "1.5s");
  assert.equal(formatAlertValue(10, alertFixture({ signal: "request_throughput" })), "10 rpm");
  assert.equal(formatAlertValue(1234, alertFixture({ signal: "log_count" })), (1234).toLocaleString());
  assert.equal(formatAlertValue(3, alertFixture({ signal: "metric_value", metricUnit: "jobs" })), "3 jobs");
  assert.equal(conditionLabel(alertFixture({ signal: "no_telemetry", windowMinutes: 60 })), "No telemetry for 1h");
  assert.match(conditionLabel(alertFixture({ signal: "log_count", logLevel: "error", operator: "gte", threshold: 4 })), /error logs ≥ 4 for 5m/);
  assert.match(conditionLabel(alertFixture({ signal: "metric_value", metricAggregation: "max", metricName: "queue.depth", metricUnit: "jobs" })), /max queue.depth > 5 jobs/);
  for (const value of [null, undefined, NaN, Infinity]) assert.equal(formatAlertValue(value, alertFixture()), "—");
  assert.equal(formatWindow(60), "1h");
});

test("evaluation timing distinguishes never, unknown, just now and past time", (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-10-05T12:01:00Z"));
  assert.equal(formatRelativeTime(null), "Never"); assert.equal(formatRelativeTime("invalid"), "Unknown");
  assert.equal(formatRelativeTime("2026-10-05T12:00:59Z"), "Just now");
  assert.equal(formatRelativeTime("2026-10-05T12:00:00Z"), "1m ago");
});
