import assert from "node:assert/strict";
import test from "node:test";
import {
  alertEvaluationWindow,
  type AlertRule,
} from "../src/lib/alert-evaluator";

const rule: AlertRule = {
  id: "alert-1",
  organizationId: "org-1",
  name: "Checkout errors",
  signal: "request_error_rate",
  service: "checkout-api",
  environment: null,
  metricName: null,
  metricType: null,
  metricUnit: null,
  metricAggregationTemporality: null,
  metricIsMonotonic: null,
  metricAggregation: null,
  logLevel: "all",
  logQuery: null,
  operator: "gte",
  threshold: 5,
  windowMinutes: 5,
  minimumSamples: 20,
  consecutiveFailures: 2,
  consecutiveRecoveries: 2,
  noDataState: "no_data",
  state: "healthy",
  failureStreak: 0,
  recoveryStreak: 0,
  notificationEmail: null,
  mutedUntil: null,
  leaseOwner: "worker-1",
};

test("uses a closed minute boundary with the late-data delay", () => {
  const window = alertEvaluationWindow(
    rule,
    new Date("2026-08-31T12:34:59.999Z"),
  );

  assert.equal(window.evaluationEnd.toISOString(), "2026-08-31T12:33:00.000Z");
  assert.equal(window.windowStart.toISOString(), "2026-08-31T12:28:00.000Z");
  assert.equal(window.windowSeconds, 300);
});
