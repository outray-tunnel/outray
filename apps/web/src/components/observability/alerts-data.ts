import Activity03Icon from "@outray/icons/stroke/Activity03Icon";
import Clock01Icon from "@outray/icons/stroke/Clock01Icon";
import LogsIcon from "@outray/icons/stroke/LogsIcon";
import Route03Icon from "@outray/icons/stroke/Route03Icon";

export type AlertSignal =
  | "request_error_rate"
  | "request_latency_p95"
  | "request_throughput"
  | "metric_value"
  | "log_count"
  | "no_telemetry";

export type AlertOperator = "gt" | "gte" | "lt" | "lte";
export type AlertState =
  "healthy" | "pending" | "firing" | "no_data" | "error" | "muted" | "paused";

export interface AlertRecord {
  id: string;
  name: string;
  description: string | null;
  signal: AlertSignal;
  service: string;
  environment: string | null;
  metricKey: string | null;
  metricName: string | null;
  metricType: string | null;
  metricUnit: string | null;
  aggregationTemporality: string | null;
  isMonotonic: boolean | null;
  metricAggregation: "latest" | "avg" | "max" | "min" | null;
  logLevel: "all" | "debug" | "info" | "warn" | "error" | null;
  logQuery: string | null;
  operator: AlertOperator;
  threshold: number;
  windowMinutes: number;
  evaluationIntervalSeconds: number;
  consecutiveFailures: number;
  consecutiveRecoveries: number;
  minimumSamples: number;
  noDataState: "no_data" | "healthy" | "alerting";
  notificationEmail: string | null;
  notificationEmails: string[];
  notificationSlackConfigured: boolean;
  notificationDiscordConfigured: boolean;
  notificationSlackTarget: { workspaceName?: string; channelName?: string; channelId?: string; guildId?: string; connectedAt: string } | null;
  notificationDiscordTarget: { workspaceName?: string; channelName?: string; channelId?: string; guildId?: string; connectedAt: string } | null;
  enabled: boolean;
  state: AlertState;
  underlyingState: Exclude<AlertState, "muted" | "paused"> | null;
  mutedUntil: string | null;
  currentValue: number | null;
  sampleCount: number;
  failureStreak: number;
  recoveryStreak: number;
  lastEvaluatedAt: string | null;
  nextEvaluationAt: string | null;
  lastStateChangedAt: string | null;
  lastEvaluationError: string | null;
  createdAt: string;
  updatedAt: string;
  openIncidentId: string | null;
}

export interface AlertSummary {
  total: number;
  firing: number;
  healthy: number;
  pending: number;
  error: number;
  muted: number;
  noData: number;
  paused?: number;
}

export interface AlertsResponse {
  alerts: AlertRecord[];
  summary: AlertSummary;
  services: Array<string | { name: string }>;
  integrationAvailability: { slack: boolean; discord: boolean };
}

export interface AlertsSnapshot extends AlertsResponse {
  receivedAt: number;
}

export interface AlertsSearch {
  search?: string;
  service?: string;
  signal?: AlertSignal;
  state?: AlertState;
}

export const ALERT_STATES: AlertState[] = ["firing", "pending", "healthy", "error", "no_data", "muted", "paused"];

/** Defaults are omitted so direct links and Back/Forward restore the same list. */
export function normalizeAlertsSearch(input: unknown): AlertsSearch {
  const values = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const search = typeof values.search === "string" ? values.search.trim().slice(0, 200) : "";
  const service = typeof values.service === "string" ? values.service.trim().slice(0, 200) : "";
  const signal = signalOptions.find((item) => item.value === values.signal)?.value;
  const state = ALERT_STATES.find((item) => item === values.state);
  return { ...(search ? { search } : {}), ...(service ? { service } : {}), ...(signal ? { signal } : {}), ...(state ? { state } : {}) };
}

export function filterAlerts(alerts: AlertRecord[], input: AlertsSearch): AlertRecord[] {
  const filters = normalizeAlertsSearch(input);
  const search = filters.search?.toLocaleLowerCase();
  return alerts.filter((alert) => (!search || [alert.name, alert.description, alert.service, alert.environment, signalLabel(alert.signal), alert.metricName, alert.logQuery].some((value) => value?.toLocaleLowerCase().includes(search))) &&
    (!filters.service || alert.service === filters.service) && (!filters.signal || alert.signal === filters.signal) && (!filters.state || getEffectiveState(alert) === filters.state));
}

export function alertServiceOptions(data: AlertsResponse | undefined, selected?: string): string[] {
  return [...new Set([...(data?.services ?? []).map(normalizeServiceName), ...(data?.alerts ?? []).map((alert) => alert.service), ...(selected ? [selected] : [])].filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function summarizeAlerts(alerts: AlertRecord[]): AlertSummary {
  const counts: Required<AlertSummary> = { total: alerts.length, firing: 0, healthy: 0, pending: 0, error: 0, muted: 0, noData: 0, paused: 0 };
  for (const alert of alerts) {
    const state = getEffectiveState(alert);
    counts[state === "no_data" ? "noData" : state] += 1;
  }
  return counts;
}

export const signalOptions: Array<{
  value: AlertSignal;
  label: string;
  description: string;
}> = [
  {
    value: "request_error_rate",
    label: "5xx error rate",
    description: "OTel errors and HTTP responses at or above 500",
  },
  {
    value: "request_latency_p95",
    label: "P95 request latency",
    description: "The slowest five percent of server requests",
  },
  {
    value: "request_throughput",
    label: "Request throughput",
    description: "Requests received per minute",
  },
  {
    value: "metric_value",
    label: "Metric value",
    description: "A threshold on a reported gauge instrument",
  },
  {
    value: "log_count",
    label: "Log count",
    description: "Matching log events within a time window",
  },
  {
    value: "no_telemetry",
    label: "No telemetry",
    description: "A service stops reporting telemetry",
  },
];

export function getEffectiveState(alert: AlertRecord): AlertState {
  if (!alert.enabled) return "paused";
  if (
    alert.state === "muted" ||
    (alert.mutedUntil && new Date(alert.mutedUntil).getTime() > Date.now())
  ) {
    return "muted";
  }
  return alert.state || "no_data";
}

export function signalLabel(signal: AlertSignal) {
  return (
    signalOptions.find((option) => option.value === signal)?.label || signal
  );
}

export function signalIcon(signal: AlertSignal) {
  if (signal === "metric_value") return Activity03Icon;
  if (signal === "log_count") return LogsIcon;
  if (signal === "no_telemetry") return Clock01Icon;
  return Route03Icon;
}

export function conditionLabel(alert: AlertRecord) {
  if (alert.signal === "no_telemetry") {
    return `No telemetry for ${formatWindow(alert.windowMinutes)}`;
  }
  const subject =
    alert.signal === "metric_value"
      ? `${alert.metricAggregation || "latest"} ${alert.metricName || "metric"}`
      : alert.signal === "log_count"
        ? `${alert.logLevel && alert.logLevel !== "all" ? `${alert.logLevel} ` : ""}logs`
        : signalLabel(alert.signal);
  return `${subject} ${operatorLabel(alert.operator)} ${formatAlertValue(alert.threshold, alert)} for ${formatWindow(alert.windowMinutes)}`;
}

export function formatAlertValue(
  value: number | null | undefined,
  alert: Pick<AlertRecord, "signal" | "metricUnit">,
) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }
  const numeric = Number(value);
  if (alert.signal === "request_error_rate") return `${formatNumber(numeric)}%`;
  if (alert.signal === "request_latency_p95") return formatDuration(numeric);
  if (alert.signal === "request_throughput")
    return `${formatNumber(numeric)} rpm`;
  if (alert.signal === "log_count") return numeric.toLocaleString();
  if (alert.signal === "metric_value") {
    return `${formatNumber(numeric)}${alert.metricUnit ? ` ${alert.metricUnit}` : ""}`;
  }
  return formatNumber(numeric);
}

export function operatorLabel(operator: AlertOperator) {
  return ({ gt: ">", gte: "≥", lt: "<", lte: "≤" } as const)[operator];
}

export function formatWindow(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

export function formatDuration(milliseconds: number) {
  if (milliseconds >= 1_000) return `${formatNumber(milliseconds / 1_000)}s`;
  return `${formatNumber(milliseconds)}ms`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
    value,
  );
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "Never";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatClockTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

export function normalizeServiceName(value: string | { name: string }) {
  return typeof value === "string" ? value : value.name;
}
