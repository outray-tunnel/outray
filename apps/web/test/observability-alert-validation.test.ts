import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAlertManagerRole,
  validateAlertCreateInput,
  validateAlertPatchInput,
} from "../src/lib/observability/alert-validation";
import { serializeAlert } from "../src/lib/observability/alert-api";

const requestAlert = {
  name: "API error rate",
  signal: "request_error_rate",
  service: "checkout-api",
  operator: "gte",
  threshold: 5,
  windowMinutes: 5,
};

test("normalizes a request alert and applies safe defaults", () => {
  const result = validateAlertCreateInput(requestAlert);

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.minimumSamples, 20);
  assert.equal(result.data.evaluationIntervalSeconds, 60);
  assert.equal(result.data.consecutiveFailures, 2);
  assert.equal(result.data.consecutiveRecoveries, 2);
  assert.equal(result.data.noDataState, "no_data");
  assert.equal(result.data.enabled, true);
});

test("requires no-telemetry windows of at least five minutes", () => {
  const invalid = validateAlertCreateInput({
    name: "Checkout stopped reporting",
    signal: "no_telemetry",
    service: "checkout-api",
    windowMinutes: 1,
  });
  assert.deepEqual(invalid, {
    success: false,
    field: "windowMinutes",
    error: "no_telemetry alerts require a window of at least 5 minutes",
  });

  const valid = validateAlertCreateInput({
    name: "Checkout stopped reporting",
    signal: "no_telemetry",
    service: "checkout-api",
    windowMinutes: 5,
  });
  assert.equal(valid.success, true);
  if (!valid.success) return;
  assert.equal(valid.data.operator, "lt");
  assert.equal(valid.data.threshold, 1);
  assert.equal(valid.data.minimumSamples, 1);
});

test("requires a complete gauge identity for metric alerts", () => {
  const missingIdentity = validateAlertCreateInput({
    name: "Queue depth",
    signal: "metric_value",
    service: "worker",
    operator: "gt",
    threshold: 100,
    windowMinutes: 5,
  });
  assert.equal(missingIdentity.success, false);
  if (!missingIdentity.success) assert.equal(missingIdentity.field, "metricKey");

  const counter = validateAlertCreateInput({
    name: "Queue depth",
    signal: "metric_value",
    service: "worker",
    metricKey: "0123456789abcdef0123456789abcdef",
    metricName: "queue.depth",
    metricType: "sum",
    metricUnit: "items",
    aggregationTemporality: "cumulative",
    isMonotonic: true,
    metricAggregation: "max",
    operator: "gt",
    threshold: 100,
    windowMinutes: 5,
  });
  assert.equal(counter.success, false);
  if (!counter.success) assert.equal(counter.field, "metricType");

  const gauge = validateAlertCreateInput({
    name: "Queue depth",
    signal: "metric_value",
    service: "worker",
    metricKey: "0123456789ABCDEF0123456789ABCDEF",
    metricName: "queue.depth",
    metricType: "gauge",
    metricUnit: "items",
    aggregationTemporality: "unspecified",
    isMonotonic: false,
    metricAggregation: "max",
    operator: "gt",
    threshold: 100,
    windowMinutes: 5,
  });
  assert.equal(gauge.success, true);
  if (!gauge.success) return;
  assert.equal(gauge.data.metricKey, "0123456789abcdef0123456789abcdef");
  assert.equal(gauge.data.metricAggregation, "max");
});

test("rejects unknown or unsafe query fields", () => {
  for (const unsafeField of ["endpoint", "query"]) {
    const result = validateAlertCreateInput({
      ...requestAlert,
      [unsafeField]: "https://example.com",
    });
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.field, unsafeField);
  }
});

test("rejects non-finite thresholds and missing services", () => {
  for (const threshold of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = validateAlertCreateInput({ ...requestAlert, threshold });
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.field, "threshold");
  }

  const missingService = validateAlertCreateInput({
    ...requestAlert,
    service: null,
  });
  assert.equal(missingService.success, false);
  if (!missingService.success) assert.equal(missingService.field, "service");

  const subMinuteInterval = validateAlertCreateInput({
    ...requestAlert,
    evaluationIntervalSeconds: 30,
  });
  assert.equal(subMinuteInterval.success, false);
  if (!subMinuteInterval.success) {
    assert.equal(subMinuteInterval.field, "evaluationIntervalSeconds");
  }
});

test("patch validation merges focused updates into the current config", () => {
  const created = validateAlertCreateInput({
    ...requestAlert,
    notificationEmail: "ADMIN@EXAMPLE.COM",
  });
  assert.equal(created.success, true);
  if (!created.success) return;
  assert.equal(created.data.notificationEmail, "admin@example.com");

  const patched = validateAlertPatchInput({ enabled: false }, created.data);
  assert.equal(patched.success, true);
  if (!patched.success) return;
  assert.equal(patched.data.enabled, false);
  assert.equal(patched.data.service, "checkout-api");
  assert.equal(patched.data.notificationEmail, "admin@example.com");
});

test("only organization owners and admins can manage alerts", () => {
  assert.equal(isAlertManagerRole("owner"), true);
  assert.equal(isAlertManagerRole("admin"), true);
  assert.equal(isAlertManagerRole("member"), false);
  assert.equal(isAlertManagerRole(null), false);
});

test("exposes paused, muted, and evaluation-error states by precedence", () => {
  const now = new Date("2026-08-31T12:00:00.000Z");
  const row = {
    id: "alert-1",
    organizationId: "org-1",
    createdBy: "user-1",
    name: "API error rate",
    description: null,
    signal: "request_error_rate",
    service: "checkout-api",
    environment: null,
    metricKey: null,
    metricName: null,
    metricType: null,
    metricUnit: null,
    aggregationTemporality: null,
    isMonotonic: null,
    metricAggregation: null,
    logLevel: "all",
    logQuery: null,
    operator: "gte",
    threshold: 5,
    windowMinutes: 5,
    evaluationIntervalSeconds: 60,
    consecutiveFailures: 2,
    consecutiveRecoveries: 2,
    minimumSamples: 20,
    noDataState: "no_data",
    notificationEmail: null,
    enabled: true,
    underlyingState: "healthy",
    currentValue: 1,
    sampleCount: 100,
    failureStreak: 0,
    recoveryStreak: 1,
    lastEvaluatedAt: now,
    lastStateChangedAt: now,
    nextEvaluationAt: now,
    lastEvaluationError: "Tinybird timeout",
    leaseOwner: null,
    leaseUntil: null,
    mutedUntil: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  } as Parameters<typeof serializeAlert>[0];

  assert.equal(serializeAlert(row, now).state, "error");
  assert.equal(
    serializeAlert(
      { ...row, mutedUntil: new Date("2026-08-31T12:30:00.000Z") },
      now,
    ).state,
    "muted",
  );
  assert.equal(
    serializeAlert(
      {
        ...row,
        enabled: false,
        mutedUntil: new Date("2026-08-31T12:30:00.000Z"),
      },
      now,
    ).state,
    "paused",
  );
  assert.equal(serializeAlert(row, now).underlyingState, "healthy");
});
