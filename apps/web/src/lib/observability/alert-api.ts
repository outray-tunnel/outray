import type {
  incidents,
  notifications,
  observabilityAlertEvaluations,
  observabilityAlerts,
} from "@/db/alerts-schema";
import type {
  AlertAggregationTemporality,
  AlertConfig,
  AlertLogLevel,
  AlertMetricAggregation,
  AlertNoDataState,
  AlertOperator,
  AlertSignal,
} from "./alert-validation";

type AlertRow = typeof observabilityAlerts.$inferSelect;
type EvaluationRow = typeof observabilityAlertEvaluations.$inferSelect;
type IncidentRow = typeof incidents.$inferSelect;
type NotificationRow = typeof notifications.$inferSelect;

export function serializeAlert(
  row: AlertRow,
  now = new Date(),
  openIncidentId: string | null = null,
) {
  const underlyingState = row.underlyingState as
    | "healthy"
    | "pending"
    | "firing"
    | "no_data"
    | "error";
  const isMuted = Boolean(row.mutedUntil && row.mutedUntil > now);
  const state = !row.enabled
    ? "paused"
    : isMuted
      ? "muted"
      : row.lastEvaluationError
        ? "error"
        : underlyingState;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    signal: row.signal as AlertSignal,
    service: row.service,
    environment: row.environment,
    metricKey: row.metricKey,
    metricName: row.metricName,
    metricType: row.metricType,
    metricUnit: row.metricUnit,
    aggregationTemporality: row.aggregationTemporality,
    isMonotonic: row.isMonotonic,
    metricAggregation: row.metricAggregation,
    logLevel: row.logLevel,
    logQuery: row.logQuery,
    operator: row.operator as AlertOperator,
    threshold: row.threshold,
    windowMinutes: row.windowMinutes,
    evaluationIntervalSeconds: row.evaluationIntervalSeconds,
    consecutiveFailures: row.consecutiveFailures,
    consecutiveRecoveries: row.consecutiveRecoveries,
    minimumSamples: row.minimumSamples,
    noDataState: row.noDataState as AlertNoDataState,
    notificationEmail: row.notificationEmail,
    enabled: row.enabled,
    state,
    underlyingState,
    openIncidentId,
    mutedUntil: iso(row.mutedUntil),
    currentValue: row.currentValue,
    sampleCount: row.sampleCount,
    failureStreak: row.failureStreak,
    recoveryStreak: row.recoveryStreak,
    lastEvaluatedAt: iso(row.lastEvaluatedAt),
    lastStateChangedAt: iso(row.lastStateChangedAt),
    nextEvaluationAt: iso(row.nextEvaluationAt),
    lastEvaluationError: row.lastEvaluationError,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function alertConfigFromRow(row: AlertRow): AlertConfig {
  return {
    name: row.name,
    description: row.description,
    signal: row.signal as AlertSignal,
    service: row.service,
    environment: row.environment,
    metricKey: row.metricKey,
    metricName: row.metricName,
    metricType: row.metricType as "gauge" | null,
    metricUnit: row.metricUnit,
    aggregationTemporality:
      row.aggregationTemporality as AlertAggregationTemporality | null,
    isMonotonic: row.isMonotonic,
    metricAggregation:
      row.metricAggregation as AlertMetricAggregation | null,
    logLevel: row.logLevel as AlertLogLevel,
    logQuery: row.logQuery,
    operator: row.operator as AlertOperator,
    threshold: row.threshold,
    windowMinutes: row.windowMinutes as AlertConfig["windowMinutes"],
    evaluationIntervalSeconds:
      row.evaluationIntervalSeconds as AlertConfig["evaluationIntervalSeconds"],
    consecutiveFailures: row.consecutiveFailures,
    consecutiveRecoveries: row.consecutiveRecoveries,
    minimumSamples: row.minimumSamples,
    noDataState: row.noDataState as AlertNoDataState,
    notificationEmail: row.notificationEmail,
    enabled: row.enabled,
    mutedUntil: row.mutedUntil,
  };
}

export function alertConfigValues(config: AlertConfig) {
  return {
    name: config.name,
    description: config.description,
    signal: config.signal,
    service: config.service,
    environment: config.environment,
    metricKey: config.metricKey,
    metricName: config.metricName,
    metricType: config.metricType,
    metricUnit: config.metricUnit,
    aggregationTemporality: config.aggregationTemporality,
    isMonotonic: config.isMonotonic,
    metricAggregation: config.metricAggregation,
    logLevel: config.logLevel,
    logQuery: config.logQuery,
    operator: config.operator,
    threshold: config.threshold,
    windowMinutes: config.windowMinutes,
    evaluationIntervalSeconds: config.evaluationIntervalSeconds,
    consecutiveFailures: config.consecutiveFailures,
    consecutiveRecoveries: config.consecutiveRecoveries,
    minimumSamples: config.minimumSamples,
    noDataState: config.noDataState,
    notificationEmail: config.notificationEmail,
    enabled: config.enabled,
    mutedUntil: config.mutedUntil,
  };
}

export function serializeEvaluation(row: EvaluationRow) {
  return {
    id: row.id,
    evaluatedAt: iso(row.evaluatedAt),
    windowStartedAt: iso(row.windowStartedAt),
    windowEndedAt: iso(row.windowEndedAt),
    status: row.status,
    value: row.value,
    sampleCount: row.sampleCount,
    breached: row.breached,
    previousState: row.previousState,
    resultingState: row.resultingState,
    queryDurationMs: row.queryDurationMs,
    error: row.error,
  };
}

export function serializeIncident(row: IncidentRow) {
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    status: row.status,
    title: row.title,
    triggerValue: row.triggerValue,
    lastValue: row.lastValue,
    resolvedValue: row.resolvedValue,
    startedAt: iso(row.startedAt),
    resolvedAt: iso(row.resolvedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function serializeNotification(row: NotificationRow) {
  return {
    id: row.id,
    incidentId: row.incidentId,
    event: row.event,
    channel: row.channel,
    recipient: row.recipient,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: iso(row.nextAttemptAt),
    lastError: row.lastError,
    sentAt: iso(row.sentAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}
