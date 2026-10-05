import type { AlertRecord, AlertsSnapshot } from "../../src/components/observability/alerts-data";

export function alertFixture(overrides: Partial<AlertRecord> = {}): AlertRecord {
  return {
    id: "rule-a", name: "API error rate", description: "Watch checkout failures", signal: "request_error_rate", service: "payments-worker", environment: "production",
    metricKey: null, metricName: null, metricType: null, metricUnit: null, aggregationTemporality: null, isMonotonic: null, metricAggregation: null,
    logLevel: "all", logQuery: null, operator: "gt", threshold: 5, windowMinutes: 5, evaluationIntervalSeconds: 60,
    consecutiveFailures: 2, consecutiveRecoveries: 2, minimumSamples: 20, noDataState: "no_data", notificationEmail: null, notificationEmails: [],
    notificationSlackConfigured: false, notificationDiscordConfigured: false, notificationSlackTarget: null, notificationDiscordTarget: null,
    enabled: true, state: "firing", underlyingState: "firing", mutedUntil: null, currentValue: 8.25, sampleCount: 100, failureStreak: 3, recoveryStreak: 0,
    lastEvaluatedAt: "2026-10-05T12:00:00Z", nextEvaluationAt: "2026-10-05T12:01:00Z", lastStateChangedAt: "2026-10-05T11:50:00Z", lastEvaluationError: null,
    createdAt: "2026-10-03T11:00:00Z", updatedAt: "2026-10-05T12:00:00Z", openIncidentId: "incident-a", ...overrides,
  };
}

export const alertsSnapshot: AlertsSnapshot = {
  alerts: [alertFixture(), alertFixture({ id: "rule-b", name: "Queue lag", signal: "metric_value", service: "queue", environment: null, metricName: "queue.depth", metricUnit: "jobs", state: "healthy", underlyingState: "healthy", currentValue: 4 })],
  summary: { total: 2, firing: 1, healthy: 1, pending: 0, error: 0, muted: 0, noData: 0, paused: 0 },
  services: ["payments-worker", { name: "queue" }], integrationAvailability: { slack: true, discord: false }, receivedAt: Date.parse("2026-10-05T12:01:00Z"),
};
