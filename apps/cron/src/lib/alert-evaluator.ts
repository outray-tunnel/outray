import { config } from "../config";
import {
  thresholdBreached,
  type AlertNoDataState,
  type AlertObservation,
  type AlertOperator,
  type AlertState,
} from "./alert-state";
import { queryTinybird } from "./tinybird";

export type AlertSignal =
  | "request_error_rate"
  | "request_latency_p95"
  | "request_throughput"
  | "metric_value"
  | "log_count"
  | "no_telemetry";

export interface AlertRule {
  id: string;
  organizationId: string;
  name: string;
  signal: AlertSignal;
  service: string;
  environment: string | null;
  metricName: string | null;
  metricType: string | null;
  metricUnit: string | null;
  metricAggregationTemporality: number | null;
  metricIsMonotonic: boolean | null;
  metricAggregation: "latest" | "avg" | "max" | "min" | null;
  logLevel: "all" | "debug" | "info" | "warn" | "error" | null;
  logQuery: string | null;
  operator: AlertOperator;
  threshold: number;
  windowMinutes: number;
  minimumSamples: number;
  consecutiveFailures: number;
  consecutiveRecoveries: number;
  noDataState: AlertNoDataState;
  state: AlertState;
  failureStreak: number;
  recoveryStreak: number;
  notificationEmail: string | null;
  mutedUntil: Date | null;
  leaseOwner: string;
}

export interface AlertMeasurement {
  observation: AlertObservation;
  value: number | null;
  sampleCount: number;
  breached: boolean | null;
  evaluationEnd: Date;
  windowStart: Date;
}

export async function evaluateAlertRule(
  alert: AlertRule,
  now = new Date(),
): Promise<AlertMeasurement> {
  const { evaluationEnd, windowStart, windowSeconds } = alertEvaluationWindow(
    alert,
    now,
  );

  if (alert.signal === "no_telemetry") {
    const row = onlyRow(
      await queryTinybird("alert_service_heartbeat", {
        organization_id: alert.organizationId,
        service: alert.service,
        environment: alert.environment || undefined,
        evaluation_time: tinybirdTimestamp(evaluationEnd),
        lookback_seconds: windowSeconds,
      }),
    );
    const sampleCount =
      finiteInteger(row.span_count) +
      finiteInteger(row.log_count) +
      finiteInteger(row.metric_count);
    return {
      observation: sampleCount === 0 ? "breach" : "healthy",
      value: sampleCount,
      sampleCount,
      breached: sampleCount === 0,
      evaluationEnd,
      windowStart,
    };
  }

  if (
    alert.signal === "request_error_rate" ||
    alert.signal === "request_latency_p95" ||
    alert.signal === "request_throughput"
  ) {
    const row = onlyRow(
      await queryTinybird("alert_http_service", {
        organization_id: alert.organizationId,
        service: alert.service,
        environment: alert.environment || undefined,
        evaluation_time: tinybirdTimestamp(evaluationEnd),
        window_seconds: windowSeconds,
      }),
    );
    const sampleCount = finiteInteger(row.sample_count);
    const value = finiteNumber(
      alert.signal === "request_error_rate"
        ? row.failure_rate_pct
        : alert.signal === "request_latency_p95"
          ? row.p95_duration_ms
          : row.requests_per_minute,
    );
    return measurement(alert, value, sampleCount, evaluationEnd, windowStart);
  }

  if (alert.signal === "log_count") {
    const row = onlyRow(
      await queryTinybird("alert_log_service", {
        organization_id: alert.organizationId,
        service: alert.service,
        environment: alert.environment || undefined,
        level:
          alert.logLevel && alert.logLevel !== "all"
            ? alert.logLevel
            : undefined,
        search: alert.logQuery || undefined,
        evaluation_time: tinybirdTimestamp(evaluationEnd),
        window_seconds: windowSeconds,
      }),
    );
    const sampleCount = finiteInteger(row.sample_count);
    return measurement(
      alert,
      finiteNumber(row.matching_count),
      sampleCount,
      evaluationEnd,
      windowStart,
    );
  }

  if (!alert.metricName || alert.metricType !== "gauge") {
    throw new Error("Metric alert is missing a supported gauge identity");
  }
  const row = onlyRow(
    await queryTinybird("alert_metric_gauge", {
      organization_id: alert.organizationId,
      service: alert.service,
      environment: alert.environment || undefined,
      metric_name: alert.metricName,
      metric_unit: alert.metricUnit || "__outray_empty__",
      metric_type: alert.metricType,
      aggregation_temporality: alert.metricAggregationTemporality ?? 0,
      is_monotonic: Number(Boolean(alert.metricIsMonotonic)),
      evaluation_time: tinybirdTimestamp(evaluationEnd),
      window_seconds: windowSeconds,
    }),
  );
  const aggregation = alert.metricAggregation || "latest";
  const value = finiteNumber(
    aggregation === "avg"
      ? row.avg_value
      : aggregation === "max"
        ? row.max_value
        : aggregation === "min"
          ? row.min_value
          : row.latest_value,
  );
  return measurement(
    alert,
    value,
    finiteInteger(row.raw_point_count),
    evaluationEnd,
    windowStart,
  );
}

export function alertEvaluationWindow(alert: AlertRule, now = new Date()) {
  const evaluationEnd = evaluationBoundary(now);
  const windowSeconds = alert.windowMinutes * 60;
  return {
    evaluationEnd,
    windowStart: new Date(evaluationEnd.getTime() - windowSeconds * 1_000),
    windowSeconds,
  };
}

function measurement(
  alert: AlertRule,
  value: number | null,
  sampleCount: number,
  evaluationEnd: Date,
  windowStart: Date,
): AlertMeasurement {
  if (sampleCount < alert.minimumSamples || value === null) {
    return {
      observation: "no_data",
      value,
      sampleCount,
      breached: null,
      evaluationEnd,
      windowStart,
    };
  }
  const breached = thresholdBreached(value, alert.operator, alert.threshold);
  return {
    observation: breached ? "breach" : "healthy",
    value,
    sampleCount,
    breached,
    evaluationEnd,
    windowStart,
  };
}

function onlyRow<T>(rows: T[]): T {
  if (rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") {
    throw new Error("Alert evaluator returned an invalid row count");
  }
  return rows[0];
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Alert evaluator returned a non-finite value");
  }
  return parsed;
}

function finiteInteger(value: unknown): number {
  const parsed = finiteNumber(value);
  if (parsed === null || parsed < 0) {
    throw new Error("Alert evaluator returned an invalid sample count");
  }
  return Math.trunc(parsed);
}

function evaluationBoundary(now: Date) {
  const timestamp = now.getTime();
  const minute = Math.floor(timestamp / 60_000) * 60_000;
  return new Date(minute - config.alertLateDataSeconds * 1_000);
}

function tinybirdTimestamp(value: Date) {
  return value.toISOString().replace("T", " ").replace("Z", "");
}
