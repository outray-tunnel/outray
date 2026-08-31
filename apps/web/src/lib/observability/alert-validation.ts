export const ALERT_SIGNALS = [
  "request_error_rate",
  "request_latency_p95",
  "request_throughput",
  "metric_value",
  "log_count",
  "no_telemetry",
] as const;

export const ALERT_OPERATORS = ["gt", "gte", "lt", "lte"] as const;
export const ALERT_NO_DATA_STATES = [
  "no_data",
  "healthy",
  "alerting",
] as const;
export const ALERT_LOG_LEVELS = [
  "all",
  "debug",
  "info",
  "warn",
  "error",
] as const;
export const ALERT_METRIC_AGGREGATIONS = [
  "latest",
  "avg",
  "max",
  "min",
] as const;
export const ALERT_AGGREGATION_TEMPORALITIES = [
  "unspecified",
  "delta",
  "cumulative",
] as const;
export const ALERT_WINDOWS = [1, 5, 10, 15, 30, 60] as const;
export const ALERT_EVALUATION_INTERVALS = [60, 300, 900] as const;

export type AlertSignal = (typeof ALERT_SIGNALS)[number];
export type AlertOperator = (typeof ALERT_OPERATORS)[number];
export type AlertNoDataState = (typeof ALERT_NO_DATA_STATES)[number];
export type AlertLogLevel = (typeof ALERT_LOG_LEVELS)[number];
export type AlertMetricAggregation =
  (typeof ALERT_METRIC_AGGREGATIONS)[number];
export type AlertAggregationTemporality =
  (typeof ALERT_AGGREGATION_TEMPORALITIES)[number];

export interface AlertConfig {
  name: string;
  description: string | null;
  signal: AlertSignal;
  service: string;
  environment: string | null;
  metricKey: string | null;
  metricName: string | null;
  metricType: "gauge" | null;
  metricUnit: string | null;
  aggregationTemporality: AlertAggregationTemporality | null;
  isMonotonic: boolean | null;
  metricAggregation: AlertMetricAggregation | null;
  logLevel: AlertLogLevel;
  logQuery: string | null;
  operator: AlertOperator;
  threshold: number;
  windowMinutes: (typeof ALERT_WINDOWS)[number];
  evaluationIntervalSeconds: (typeof ALERT_EVALUATION_INTERVALS)[number];
  consecutiveFailures: number;
  consecutiveRecoveries: number;
  minimumSamples: number;
  noDataState: AlertNoDataState;
  notificationEmail: string | null;
  enabled: boolean;
  mutedUntil: Date | null;
}

export type AlertValidationResult =
  | { success: true; data: AlertConfig }
  | { success: false; error: string; field?: string };

const CREATE_FIELDS = new Set([
  "name",
  "description",
  "signal",
  "service",
  "environment",
  "metricKey",
  "metricName",
  "metricType",
  "metricUnit",
  "aggregationTemporality",
  "isMonotonic",
  "metricAggregation",
  "logLevel",
  "logQuery",
  "operator",
  "threshold",
  "windowMinutes",
  "evaluationIntervalSeconds",
  "consecutiveFailures",
  "consecutiveRecoveries",
  "minimumSamples",
  "noDataState",
  "notificationEmail",
  "enabled",
]);

const PATCH_FIELDS = new Set([...CREATE_FIELDS, "mutedUntil"]);

export function validateAlertCreateInput(
  input: unknown,
): AlertValidationResult {
  const objectResult = inputObject(input, CREATE_FIELDS);
  if (!objectResult.success) return objectResult;
  return normalizeAlertConfig(objectResult.data);
}

export function validateAlertPatchInput(
  input: unknown,
  current: AlertConfig,
): AlertValidationResult {
  const objectResult = inputObject(input, PATCH_FIELDS);
  if (!objectResult.success) return objectResult;
  if (Object.keys(objectResult.data).length === 0) {
    return { success: false, error: "At least one field is required" };
  }

  return normalizeAlertConfig({
    ...alertConfigToInput(current),
    ...objectResult.data,
  });
}

export function isAlertManagerRole(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}

function normalizeAlertConfig(input: Record<string, unknown>): AlertValidationResult {
  const name = requiredString(input.name, "name", 120);
  if (!name.success) return name;

  const description = nullableString(input.description, "description", 1_000);
  if (!description.success) return description;

  const signal = enumValue(input.signal, "signal", ALERT_SIGNALS);
  if (!signal.success) return signal;

  const service = requiredString(input.service, "service", 255);
  if (!service.success) return service;
  const environment = nullableString(input.environment, "environment", 128);
  if (!environment.success) return environment;

  const operator = enumValue(
    input.operator ?? (signal.data === "no_telemetry" ? "lt" : undefined),
    "operator",
    ALERT_OPERATORS,
  );
  if (!operator.success) return operator;

  const threshold = finiteNumber(
    input.threshold ?? (signal.data === "no_telemetry" ? 1 : undefined),
    "threshold",
  );
  if (!threshold.success) return threshold;

  const windowMinutes = enumNumber(
    input.windowMinutes ?? 5,
    "windowMinutes",
    ALERT_WINDOWS,
  );
  if (!windowMinutes.success) return windowMinutes;
  if (signal.data === "no_telemetry" && windowMinutes.data < 5) {
    return {
      success: false,
      field: "windowMinutes",
      error: "no_telemetry alerts require a window of at least 5 minutes",
    };
  }

  const evaluationIntervalSeconds = enumNumber(
    input.evaluationIntervalSeconds ?? 60,
    "evaluationIntervalSeconds",
    ALERT_EVALUATION_INTERVALS,
  );
  if (!evaluationIntervalSeconds.success) return evaluationIntervalSeconds;

  const consecutiveFailures = boundedInteger(
    input.consecutiveFailures ?? 2,
    "consecutiveFailures",
    1,
    10,
  );
  if (!consecutiveFailures.success) return consecutiveFailures;
  const consecutiveRecoveries = boundedInteger(
    input.consecutiveRecoveries ?? 2,
    "consecutiveRecoveries",
    1,
    10,
  );
  if (!consecutiveRecoveries.success) return consecutiveRecoveries;

  const defaultMinimumSamples =
    signal.data === "request_error_rate" ||
    signal.data === "request_latency_p95"
      ? 20
      : 1;
  const minimumSamples = boundedInteger(
    input.minimumSamples ?? defaultMinimumSamples,
    "minimumSamples",
    1,
    1_000_000,
  );
  if (!minimumSamples.success) return minimumSamples;

  const noDataState = enumValue(
    input.noDataState ?? "no_data",
    "noDataState",
    ALERT_NO_DATA_STATES,
  );
  if (!noDataState.success) return noDataState;
  const logLevel = enumValue(
    input.logLevel ?? "all",
    "logLevel",
    ALERT_LOG_LEVELS,
  );
  if (!logLevel.success) return logLevel;
  const logQuery = nullableString(input.logQuery, "logQuery", 500);
  if (!logQuery.success) return logQuery;

  const notificationEmail = nullableEmail(input.notificationEmail);
  if (!notificationEmail.success) return notificationEmail;
  const enabled = booleanValue(input.enabled ?? true, "enabled");
  if (!enabled.success) return enabled;
  const mutedUntil = nullableDate(input.mutedUntil, "mutedUntil");
  if (!mutedUntil.success) return mutedUntil;

  let metricKey: string | null = null;
  let metricName: string | null = null;
  let metricType: "gauge" | null = null;
  let metricUnit: string | null = null;
  let aggregationTemporality: AlertAggregationTemporality | null = null;
  let isMonotonic: boolean | null = null;
  let metricAggregation: AlertMetricAggregation | null = null;

  if (signal.data === "metric_value") {
    const key = requiredString(input.metricKey, "metricKey", 128);
    if (!key.success) return key;
    if (!/^[a-f0-9]{32}$/i.test(key.data)) {
      return {
        success: false,
        field: "metricKey",
        error: "metricKey must be a Tinybird metric catalog key",
      };
    }
    const metricNameResult = requiredString(
      input.metricName,
      "metricName",
      255,
    );
    if (!metricNameResult.success) return metricNameResult;
    if (input.metricType !== "gauge") {
      return {
        success: false,
        field: "metricType",
        error: "Only gauge metrics are supported by metric_value alerts",
      };
    }
    const unitResult = nullableStringAllowEmpty(
      input.metricUnit,
      "metricUnit",
      64,
    );
    if (!unitResult.success) return unitResult;
    const temporalityResult = enumValue(
      input.aggregationTemporality,
      "aggregationTemporality",
      ALERT_AGGREGATION_TEMPORALITIES,
    );
    if (!temporalityResult.success) return temporalityResult;
    const monotonicResult = booleanValue(input.isMonotonic, "isMonotonic");
    if (!monotonicResult.success) return monotonicResult;
    const aggregationResult = enumValue(
      input.metricAggregation,
      "metricAggregation",
      ALERT_METRIC_AGGREGATIONS,
    );
    if (!aggregationResult.success) return aggregationResult;

    metricKey = key.data.toLowerCase();
    metricName = metricNameResult.data;
    metricType = "gauge";
    metricUnit = unitResult.data;
    aggregationTemporality = temporalityResult.data;
    isMonotonic = monotonicResult.data;
    metricAggregation = aggregationResult.data;
  }

  if (signal.data === "request_error_rate") {
    if (threshold.data < 0 || threshold.data > 100) {
      return {
        success: false,
        field: "threshold",
        error: "request_error_rate threshold must be between 0 and 100",
      };
    }
  } else if (signal.data !== "metric_value" && threshold.data < 0) {
    return {
      success: false,
      field: "threshold",
      error: "threshold must be zero or greater",
    };
  }

  return {
    success: true,
    data: {
      name: name.data,
      description: description.data,
      signal: signal.data,
      service: service.data,
      environment: environment.data,
      metricKey,
      metricName,
      metricType,
      metricUnit,
      aggregationTemporality,
      isMonotonic,
      metricAggregation,
      logLevel: signal.data === "log_count" ? logLevel.data : "all",
      logQuery: signal.data === "log_count" ? logQuery.data : null,
      operator: signal.data === "no_telemetry" ? "lt" : operator.data,
      threshold: signal.data === "no_telemetry" ? 1 : threshold.data,
      windowMinutes: windowMinutes.data,
      evaluationIntervalSeconds: evaluationIntervalSeconds.data,
      consecutiveFailures: consecutiveFailures.data,
      consecutiveRecoveries: consecutiveRecoveries.data,
      minimumSamples:
        signal.data === "no_telemetry" ? 1 : minimumSamples.data,
      noDataState: noDataState.data,
      notificationEmail: notificationEmail.data,
      enabled: enabled.data,
      mutedUntil: mutedUntil.data,
    },
  };
}

function alertConfigToInput(config: AlertConfig): Record<string, unknown> {
  return {
    ...config,
    mutedUntil: config.mutedUntil?.toISOString() ?? null,
  };
}

function inputObject(
  input: unknown,
  fields: ReadonlySet<string>,
):
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: string; field?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, error: "Request body must be an object" };
  }
  const data = input as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    if (!fields.has(key)) {
      return {
        success: false,
        field: key,
        error: `Unexpected field: ${key}`,
      };
    }
  }
  return { success: true, data };
}

type ValueResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; field: string };

function requiredString(
  input: unknown,
  field: string,
  maxLength: number,
): ValueResult<string> {
  if (typeof input !== "string" || !input.trim()) {
    return { success: false, field, error: `${field} is required` };
  }
  const value = input.trim();
  if (value.length > maxLength) {
    return {
      success: false,
      field,
      error: `${field} must be at most ${maxLength} characters`,
    };
  }
  return { success: true, data: value };
}

function nullableString(
  input: unknown,
  field: string,
  maxLength: number,
): ValueResult<string | null> {
  if (input === undefined || input === null || input === "") {
    return { success: true, data: null };
  }
  const result = requiredString(input, field, maxLength);
  return result.success ? result : result;
}

function nullableStringAllowEmpty(
  input: unknown,
  field: string,
  maxLength: number,
): ValueResult<string | null> {
  if (input === undefined || input === null) return { success: true, data: null };
  if (typeof input !== "string") {
    return { success: false, field, error: `${field} must be a string` };
  }
  const value = input.trim();
  if (value.length > maxLength) {
    return {
      success: false,
      field,
      error: `${field} must be at most ${maxLength} characters`,
    };
  }
  return { success: true, data: value };
}

function nullableEmail(input: unknown): ValueResult<string | null> {
  const value = nullableString(input, "notificationEmail", 254);
  if (!value.success || value.data === null) return value;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.data)) {
    return {
      success: false,
      field: "notificationEmail",
      error: "notificationEmail must be a valid email address",
    };
  }
  return { success: true, data: value.data.toLowerCase() };
}

function enumValue<const T extends readonly string[]>(
  input: unknown,
  field: string,
  values: T,
): ValueResult<T[number]> {
  if (typeof input !== "string" || !values.includes(input as T[number])) {
    return {
      success: false,
      field,
      error: `${field} must be one of: ${values.join(", ")}`,
    };
  }
  return { success: true, data: input as T[number] };
}

function enumNumber<const T extends readonly number[]>(
  input: unknown,
  field: string,
  values: T,
): ValueResult<T[number]> {
  if (typeof input !== "number" || !values.includes(input as T[number])) {
    return {
      success: false,
      field,
      error: `${field} must be one of: ${values.join(", ")}`,
    };
  }
  return { success: true, data: input as T[number] };
}

function finiteNumber(input: unknown, field: string): ValueResult<number> {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return { success: false, field, error: `${field} must be a finite number` };
  }
  return { success: true, data: input };
}

function boundedInteger(
  input: unknown,
  field: string,
  minimum: number,
  maximum: number,
): ValueResult<number> {
  if (
    typeof input !== "number" ||
    !Number.isSafeInteger(input) ||
    input < minimum ||
    input > maximum
  ) {
    return {
      success: false,
      field,
      error: `${field} must be an integer between ${minimum} and ${maximum}`,
    };
  }
  return { success: true, data: input };
}

function booleanValue(input: unknown, field: string): ValueResult<boolean> {
  if (typeof input !== "boolean") {
    return { success: false, field, error: `${field} must be a boolean` };
  }
  return { success: true, data: input };
}

function nullableDate(input: unknown, field: string): ValueResult<Date | null> {
  if (input === undefined || input === null || input === "") {
    return { success: true, data: null };
  }
  if (typeof input !== "string") {
    return {
      success: false,
      field,
      error: `${field} must be an ISO timestamp or null`,
    };
  }
  const milliseconds = Date.parse(input);
  if (!Number.isFinite(milliseconds)) {
    return {
      success: false,
      field,
      error: `${field} must be a valid ISO timestamp`,
    };
  }
  return { success: true, data: new Date(milliseconds) };
}
