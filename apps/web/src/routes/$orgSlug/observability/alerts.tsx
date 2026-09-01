import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Activity03Icon from "@hugeicons-pro/core-stroke-rounded/Activity03Icon";
import Add01Icon from "@hugeicons-pro/core-stroke-rounded/Add01Icon";
import Alert02Icon from "@hugeicons-pro/core-stroke-rounded/Alert02Icon";
import ArrowRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowRight01Icon";
import Cancel01Icon from "@hugeicons-pro/core-stroke-rounded/Cancel01Icon";
import CheckmarkCircle02Icon from "@hugeicons-pro/core-stroke-rounded/CheckmarkCircle02Icon";
import Clock01Icon from "@hugeicons-pro/core-stroke-rounded/Clock01Icon";
import LogsIcon from "@hugeicons-pro/core-stroke-rounded/LogsIcon";
import Route03Icon from "@hugeicons-pro/core-stroke-rounded/Route03Icon";
import Search01Icon from "@hugeicons-pro/core-stroke-rounded/Search01Icon";
import {
  ObservabilityHeader,
  ObservabilityPage,
  Panel,
} from "@/components/observability/observability-ui";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

export type AlertSignal =
  | "request_error_rate"
  | "request_latency_p95"
  | "request_throughput"
  | "metric_value"
  | "log_count"
  | "no_telemetry";

export type AlertOperator = "gt" | "gte" | "lt" | "lte";
export type AlertState =
  | "healthy"
  | "pending"
  | "firing"
  | "no_data"
  | "error"
  | "muted"
  | "paused";

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

interface AlertSummary {
  total: number;
  firing: number;
  healthy: number;
  pending: number;
  error: number;
  muted: number;
  noData: number;
  paused?: number;
}

interface AlertsResponse {
  alerts: AlertRecord[];
  summary: AlertSummary;
  services: Array<string | { name: string }>;
}

interface ServiceOption {
  name: string;
  environment: string;
}

interface MetricOption {
  key: string;
  name: string;
  description: string;
  unit: string;
  type: string;
  aggregationTemporality: string;
  isMonotonic: boolean;
  services: string[];
}

export const Route = createFileRoute("/$orgSlug/observability/alerts")({
  head: () => ({ meta: [{ title: "Alerts - OutRay Observability" }] }),
  component: AlertsView,
});

const signalOptions: Array<{
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

function AlertsView() {
  const { orgSlug } = Route.useParams();
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  const [signal, setSignal] = useState("all");
  const [state, setState] = useState("all");

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let refreshTimeout: number | undefined;

    const loadAlerts = async () => {
      setRefreshing(true);
      try {
        const response = await fetch(`/api/${orgSlug}/observability/alerts`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Could not load alerts");
        const nextData = (await response.json()) as AlertsResponse;
        if (disposed) return;
        setData(nextData);
        setLastSuccessAt(Date.now());
        setError(null);
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        if (!disposed) setError("Alert data is temporarily unavailable.");
      } finally {
        if (!disposed) {
          setLoading(false);
          setRefreshing(false);
          refreshTimeout = window.setTimeout(() => void loadAlerts(), 10_000);
        }
      }
    };

    void loadAlerts();
    return () => {
      disposed = true;
      controller.abort();
      if (refreshTimeout !== undefined) window.clearTimeout(refreshTimeout);
    };
  }, [orgSlug, reloadKey]);

  const alerts = useMemo(() => data?.alerts || [], [data?.alerts]);
  const serviceOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...(data?.services || []),
          ...alerts.map((alert) => alert.service),
        ].map(normalizeServiceName).filter(Boolean)),
      ).sort(),
    [alerts, data?.services],
  );
  const visibleAlerts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return alerts.filter((alert) => {
      const effectiveState = getEffectiveState(alert);
      return (
        (!normalizedQuery ||
          alert.name.toLowerCase().includes(normalizedQuery) ||
          alert.description?.toLowerCase().includes(normalizedQuery) ||
          alert.service.toLowerCase().includes(normalizedQuery) ||
          signalLabel(alert.signal).toLowerCase().includes(normalizedQuery)) &&
        (service === "all" || alert.service === service) &&
        (signal === "all" || alert.signal === signal) &&
        (state === "all" || effectiveState === state)
      );
    });
  }, [alerts, query, service, signal, state]);

  const summary = data?.summary || {
    total: 0,
    firing: 0,
    healthy: 0,
    pending: 0,
    error: 0,
    muted: 0,
    noData: 0,
    paused: 0,
  };

  return (
    <ObservabilityPage>
      <ObservabilityHeader
        title="Alerts"
        description="Evaluate requests, metrics, and logs continuously, then notify your team when a service needs attention."
        action={
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-xs font-medium text-black transition-colors hover:bg-zinc-200"
          >
            <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.9} />
            New alert
          </button>
        }
      />

      {error && data && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.035] px-4 py-3 text-xs text-amber-300">
          <span>
            {error} Showing the last successful result
            {lastSuccessAt ? ` from ${formatClockTime(lastSuccessAt)}.` : "."}
          </span>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="shrink-0 font-medium text-amber-200 hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      <section className="grid overflow-hidden rounded-xl border border-white/[0.07] sm:grid-cols-2 xl:grid-cols-8">
        {[
          ["Total", summary.total, "All rules", "text-zinc-200"],
          ["Firing", summary.firing, "Needs attention", "text-rose-400"],
          ["Pending", summary.pending, "Being confirmed", "text-amber-400"],
          ["Healthy", summary.healthy, "Within threshold", "text-emerald-400"],
          ["Error", summary.error, "Evaluation failed", "text-rose-300"],
          ["Muted", summary.muted, "Notifications held", "text-violet-300"],
          ["No data", summary.noData, "Awaiting telemetry", "text-zinc-400"],
          ["Paused", summary.paused || 0, "Evaluations stopped", "text-zinc-500"],
        ].map(([label, value, detail, color], index) => (
          <div
            key={String(label)}
            className={`px-5 py-5 sm:px-6 ${index ? "border-t border-white/[0.07] sm:border-t-0 sm:border-l" : ""}`}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-600">
              {label}
            </p>
            <p
              className={`mt-2 text-2xl font-semibold tracking-[-0.04em] ${color}`}
            >
              {value}
            </p>
            <p className="mt-1 text-[11px] text-zinc-700">{detail}</p>
          </div>
        ))}
      </section>

      <Panel>
        <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-[minmax(240px,1fr)_190px_190px_170px]">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-zinc-600 focus-within:border-white/[0.16] focus-within:text-zinc-400">
            <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.7} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search alerts"
              className="min-w-0 flex-1 bg-transparent text-xs text-zinc-300 outline-none placeholder:text-zinc-700"
            />
          </label>
          <Select
            value={service}
            onChange={setService}
            ariaLabel="Filter alerts by service"
            options={[
              { value: "all", label: "All services" },
              ...serviceOptions.map((item) => ({ value: item, label: item })),
            ]}
          />
          <Select
            value={signal}
            onChange={setSignal}
            ariaLabel="Filter alerts by signal"
            options={[
              { value: "all", label: "All signals" },
              ...signalOptions.map((item) => ({
                value: item.value,
                label: item.label,
              })),
            ]}
          />
          <Select
            value={state}
            onChange={setState}
            ariaLabel="Filter alerts by state"
            options={[
              { value: "all", label: "All states" },
              { value: "firing", label: "Firing" },
              { value: "pending", label: "Pending" },
              { value: "healthy", label: "Healthy" },
              { value: "no_data", label: "No data" },
              { value: "error", label: "Evaluation error" },
              { value: "muted", label: "Muted" },
              { value: "paused", label: "Paused" },
            ]}
          />
        </div>
      </Panel>

      <Panel
        title="All alerts"
        description={
          data
            ? `${visibleAlerts.length} of ${summary.total} alert rules`
            : "Alert rules for this workspace"
        }
        action={
          refreshing && data ? (
            <span className="text-[11px] text-zinc-700">Updating…</span>
          ) : null
        }
      >
        <div className="hidden grid-cols-[minmax(0,1fr)_170px_210px_105px_105px_120px_20px] gap-4 border-b border-white/[0.07] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-700 sm:px-6 xl:grid">
          <span>Alert</span>
          <span>Scope</span>
          <span>Condition</span>
          <span>Current</span>
          <span>State</span>
          <span>Evaluated</span>
          <span />
        </div>
        <div className="divide-y divide-white/[0.06]">
          {loading && !data ? (
            <AlertRowsSkeleton />
          ) : error && !data ? (
            <AlertListState
              tone="error"
              title="Alerts unavailable"
              detail={error}
              action="Try again"
              onAction={() => setReloadKey((value) => value + 1)}
            />
          ) : alerts.length === 0 ? (
            <AlertListState
              title="No alerts yet"
              detail="Create an alert to evaluate incoming telemetry and notify your team when a condition begins firing."
              action="Create alert"
              onAction={() => setIsCreating(true)}
            />
          ) : visibleAlerts.length === 0 ? (
            <AlertListState
              title="No alerts match these filters"
              detail="Clear your search or choose broader filters."
              action="Clear filters"
              onAction={() => {
                setQuery("");
                setService("all");
                setSignal("all");
                setState("all");
              }}
            />
          ) : (
            visibleAlerts.map((alert) => (
              <Link
                key={alert.id}
                to="/$orgSlug/observability/alerts/$alertId"
                params={{ orgSlug, alertId: alert.id }}
                className="grid w-full gap-4 px-5 py-5 text-left transition-colors hover:bg-white/[0.025] sm:px-6 xl:grid-cols-[minmax(0,1fr)_170px_210px_105px_105px_120px_20px] xl:items-center"
              >
                <div className="flex min-w-0 items-center gap-3.5">
                  <AlertIcon alert={alert} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-200">
                      {alert.name}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-zinc-700">
                      {signalLabel(alert.signal)}
                    </p>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-zinc-400">
                    {alert.service}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-zinc-700">
                    {alert.environment || "All environments"}
                  </p>
                </div>
                <code className="truncate text-[11px] text-zinc-500">
                  {conditionLabel(alert)}
                </code>
                <span className="font-mono text-xs tabular-nums text-zinc-400">
                  {formatAlertValue(alert.currentValue, alert)}
                </span>
                <AlertStatePill alert={alert} />
                <span className="text-[11px] text-zinc-700">
                  {formatRelativeTime(alert.lastEvaluatedAt)}
                </span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={14}
                  strokeWidth={1.7}
                  className="hidden text-zinc-800 xl:block"
                />
              </Link>
            ))
          )}
        </div>
      </Panel>

      <AlertFormModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        orgSlug={orgSlug}
        services={serviceOptions}
        onSaved={() => {
          setIsCreating(false);
          setReloadKey((value) => value + 1);
        }}
      />
    </ObservabilityPage>
  );
}

function AlertRowsSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 px-5 py-5 sm:px-6"
        >
          <span className="size-10 rounded-lg bg-white/[0.05]" />
          <span className="h-3 w-48 rounded bg-white/[0.06]" />
          <span className="ml-auto h-3 w-24 rounded bg-white/[0.04]" />
          <span className="h-3 w-20 rounded bg-white/[0.04]" />
        </div>
      ))}
    </div>
  );
}

function AlertListState({
  title,
  detail,
  action,
  onAction,
  tone = "neutral",
}: {
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
  tone?: "neutral" | "error";
}) {
  return (
    <div className="px-6 py-16 text-center">
      <p
        className={`text-sm font-medium ${tone === "error" ? "text-rose-400" : "text-zinc-300"}`}
      >
        {title}
      </p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-zinc-700">
        {detail}
      </p>
      <button
        type="button"
        onClick={onAction}
        className="mt-5 h-9 rounded-lg border border-white/[0.08] px-4 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.05]"
      >
        {action}
      </button>
    </div>
  );
}

export function AlertIcon({ alert }: { alert: AlertRecord }) {
  const state = getEffectiveState(alert);
  const icon = state === "healthy" ? CheckmarkCircle02Icon : Alert02Icon;
  const styles: Record<string, string> = {
    firing: "bg-rose-400/[0.09] text-rose-400",
    pending: "bg-amber-400/[0.09] text-amber-400",
    healthy: "bg-emerald-400/[0.08] text-emerald-400",
    no_data: "bg-white/[0.04] text-zinc-500",
    error: "bg-rose-400/[0.08] text-rose-300",
    muted: "bg-violet-400/[0.09] text-violet-300",
    paused: "bg-white/[0.04] text-zinc-600",
  };
  return (
    <span
      className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${styles[state] || styles.no_data}`}
    >
      <HugeiconsIcon icon={icon} size={17} strokeWidth={1.8} />
    </span>
  );
}

export function AlertStatePill({ alert }: { alert: AlertRecord }) {
  const state = getEffectiveState(alert);
  const styles: Record<string, string> = {
    firing: "text-rose-400",
    pending: "text-amber-400",
    healthy: "text-emerald-400",
    no_data: "text-zinc-500",
    error: "text-rose-300",
    muted: "text-violet-300",
    paused: "text-zinc-600",
  };
  return (
    <span
      className={`inline-flex items-center gap-2 text-xs capitalize ${styles[state] || styles.no_data}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {state.replace("_", " ")}
    </span>
  );
}

function getEffectiveState(alert: AlertRecord): AlertState {
  if (!alert.enabled) return "paused";
  if (
    alert.state === "muted" ||
    (alert.mutedUntil && new Date(alert.mutedUntil).getTime() > Date.now())
  ) {
    return "muted";
  }
  return alert.state || "no_data";
}

function signalLabel(signal: AlertSignal) {
  return signalOptions.find((option) => option.value === signal)?.label || signal;
}

function signalIcon(signal: AlertSignal) {
  if (signal === "metric_value") return Activity03Icon;
  if (signal === "log_count") return LogsIcon;
  if (signal === "no_telemetry") return Clock01Icon;
  return Route03Icon;
}

function conditionLabel(alert: AlertRecord) {
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

function formatAlertValue(
  value: number | null | undefined,
  alert: Pick<AlertRecord, "signal" | "metricUnit">,
) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "—";
  }
  const numeric = Number(value);
  if (alert.signal === "request_error_rate") return `${formatNumber(numeric)}%`;
  if (alert.signal === "request_latency_p95") return formatDuration(numeric);
  if (alert.signal === "request_throughput") return `${formatNumber(numeric)} rpm`;
  if (alert.signal === "log_count") return numeric.toLocaleString();
  if (alert.signal === "metric_value") {
    return `${formatNumber(numeric)}${alert.metricUnit ? ` ${alert.metricUnit}` : ""}`;
  }
  return formatNumber(numeric);
}

function operatorLabel(operator: AlertOperator) {
  return ({ gt: ">", gte: "≥", lt: "<", lte: "≤" } as const)[operator];
}

function formatWindow(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function formatDuration(milliseconds: number) {
  if (milliseconds >= 1_000) return `${formatNumber(milliseconds / 1_000)}s`;
  return `${formatNumber(milliseconds)}ms`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

function formatRelativeTime(value: string | null | undefined) {
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

function formatClockTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function normalizeServiceName(value: string | { name: string }) {
  return typeof value === "string" ? value : value.name;
}

export function AlertFormModal({
  isOpen,
  onClose,
  orgSlug,
  services,
  initialAlert,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  orgSlug: string;
  services: string[];
  initialAlert?: AlertRecord | null;
  onSaved: (alert: AlertRecord) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [signal, setSignal] = useState<AlertSignal>("request_error_rate");
  const [service, setService] = useState("");
  const [environment, setEnvironment] = useState("all");
  const [metricKey, setMetricKey] = useState("");
  const [metricAggregation, setMetricAggregation] = useState("latest");
  const [logLevel, setLogLevel] = useState("all");
  const [logQuery, setLogQuery] = useState("");
  const [operator, setOperator] = useState<AlertOperator>("gt");
  const [threshold, setThreshold] = useState("5");
  const [windowMinutes, setWindowMinutes] = useState("5");
  const [evaluationIntervalSeconds, setEvaluationIntervalSeconds] =
    useState("60");
  const [consecutiveFailures, setConsecutiveFailures] = useState("2");
  const [consecutiveRecoveries, setConsecutiveRecoveries] = useState("2");
  const [minimumSamples, setMinimumSamples] = useState("20");
  const [noDataState, setNoDataState] = useState("no_data");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [serviceCatalog, setServiceCatalog] = useState<ServiceOption[]>([]);
  const [logServices, setLogServices] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<MetricOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const alert = initialAlert;
    const initialSignal = alert?.signal || "request_error_rate";
    setName(alert?.name || "");
    setDescription(alert?.description || "");
    setSignal(initialSignal);
    setService(alert?.service || "");
    setEnvironment(alert?.environment || "all");
    setMetricKey(alert?.metricKey || "");
    setMetricAggregation(alert?.metricAggregation || "latest");
    setLogLevel(alert?.logLevel || "all");
    setLogQuery(alert?.logQuery || "");
    setOperator(alert?.operator || "gt");
    setThreshold(String(alert?.threshold ?? 5));
    setWindowMinutes(String(alert?.windowMinutes ?? 5));
    setEvaluationIntervalSeconds(
      String(alert?.evaluationIntervalSeconds ?? 60),
    );
    setConsecutiveFailures(String(alert?.consecutiveFailures ?? 2));
    setConsecutiveRecoveries(String(alert?.consecutiveRecoveries ?? 2));
    setMinimumSamples(
      String(
        alert?.minimumSamples ??
          (initialSignal === "request_error_rate" ||
          initialSignal === "request_latency_p95"
            ? 20
            : 1),
      ),
    );
    setNoDataState(alert?.noDataState || "no_data");
    setNotificationEmail(alert?.notificationEmail || "");
    setError(null);
  }, [initialAlert, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setOptionsLoading(true);
    void Promise.allSettled([
      fetch(`/api/${orgSlug}/observability/services?range=30d`, {
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          services?: Array<{ name: string; environment?: string }>;
        };
        setServiceCatalog(
          (payload.services || []).map((item) => ({
            name: item.name,
            environment: item.environment || "",
          })),
        );
      }),
      fetch(`/api/${orgSlug}/observability/logs?range=30d&limit=1`, {
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { services?: string[] };
        setLogServices(payload.services || []);
      }),
      fetch(`/api/${orgSlug}/observability/metrics?range=30d`, {
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { metrics?: MetricOption[] };
        setMetrics(
          (payload.metrics || []).filter(
            (metric) => metric.type.toLowerCase() === "gauge",
          ),
        );
      }),
    ]).finally(() => {
      if (!controller.signal.aborted) setOptionsLoading(false);
    });
    return () => controller.abort();
  }, [isOpen, orgSlug]);

  const availableServices = useMemo(
    () =>
      Array.from(
        new Set([
          ...services,
          ...serviceCatalog.map((item) => item.name),
          ...logServices,
          ...metrics.flatMap((metric) => metric.services || []),
          ...(initialAlert?.service ? [initialAlert.service] : []),
        ]),
      ).sort(),
    [initialAlert?.service, logServices, metrics, serviceCatalog, services],
  );
  const environments = useMemo(
    () =>
      Array.from(
        new Set(
          serviceCatalog
            .filter((item) => item.name === service)
            .map((item) => item.environment)
            .filter(Boolean),
        ),
      ).sort(),
    [service, serviceCatalog],
  );
  const availableMetrics = useMemo(() => {
    const serviceMetrics = metrics.filter(
      (metric) =>
        !metric.services?.length || metric.services.includes(service),
    );
    if (
      initialAlert?.metricKey &&
      initialAlert.service === service &&
      !serviceMetrics.some((metric) => metric.key === initialAlert.metricKey)
    ) {
      return [
        ...serviceMetrics,
        {
          key: initialAlert.metricKey,
          name: initialAlert.metricName || initialAlert.metricKey,
          description: "Configured metric",
          unit: initialAlert.metricUnit || "",
          type: initialAlert.metricType || "gauge",
          aggregationTemporality:
            initialAlert.aggregationTemporality || "unspecified",
          isMonotonic: Boolean(initialAlert.isMonotonic),
          services: [initialAlert.service],
        },
      ];
    }
    return serviceMetrics;
  }, [initialAlert, metrics, service]);
  const selectedMetric = availableMetrics.find(
    (metric) => metric.key === metricKey,
  );

  useEffect(() => {
    if (signal !== "metric_value" || !availableMetrics.length) {
      return;
    }
    if (!availableMetrics.some((metric) => metric.key === metricKey)) {
      setMetricKey(availableMetrics[0].key);
    }
  }, [availableMetrics, metricKey, signal]);

  useEffect(() => {
    if (!isOpen || !availableServices.length) return;
    if (!service || !availableServices.includes(service)) {
      setService(availableServices[0]);
      setEnvironment("all");
      setMetricKey("");
    }
  }, [availableServices, isOpen, service]);

  const selectSignal = (value: string) => {
    const nextSignal = value as AlertSignal;
    setSignal(nextSignal);
    if (
      nextSignal === "request_error_rate" ||
      nextSignal === "request_latency_p95"
    ) {
      setMinimumSamples("20");
    } else {
      setMinimumSamples("1");
    }
    if (nextSignal === "request_error_rate") setThreshold("5");
    if (nextSignal === "request_latency_p95") setThreshold("750");
    if (nextSignal === "request_throughput") setThreshold("10");
    if (nextSignal === "log_count") setThreshold("10");
    if (nextSignal === "no_telemetry" && Number(windowMinutes) < 5) {
      setWindowMinutes("5");
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const numericThreshold = Number(threshold);
    if (!normalizedName) {
      setError("Give this alert a name.");
      return;
    }
    if (!service.trim()) {
      setError("Choose a service for this alert.");
      return;
    }
    if (signal === "metric_value" && !selectedMetric) {
      setError("Choose a gauge metric to evaluate.");
      return;
    }
    if (signal !== "no_telemetry" && !Number.isFinite(numericThreshold)) {
      setError("Enter a valid threshold.");
      return;
    }

    const payload = {
      name: normalizedName,
      description: description.trim() || null,
      signal,
      service,
      environment: environment === "all" ? null : environment,
      metricKey: signal === "metric_value" ? selectedMetric?.key || null : null,
      metricName:
        signal === "metric_value" ? selectedMetric?.name || null : null,
      metricType:
        signal === "metric_value" ? selectedMetric?.type || null : null,
      metricUnit:
        signal === "metric_value" ? selectedMetric?.unit || null : null,
      aggregationTemporality:
        signal === "metric_value"
          ? selectedMetric?.aggregationTemporality || null
          : null,
      isMonotonic:
        signal === "metric_value" ? Boolean(selectedMetric?.isMonotonic) : null,
      metricAggregation:
        signal === "metric_value" ? metricAggregation : null,
      logLevel: signal === "log_count" ? logLevel : null,
      logQuery: signal === "log_count" ? logQuery.trim() || null : null,
      operator,
      threshold: signal === "no_telemetry" ? 0 : numericThreshold,
      windowMinutes: positiveInteger(windowMinutes, 5),
      evaluationIntervalSeconds: positiveInteger(
        evaluationIntervalSeconds,
        60,
      ),
      consecutiveFailures: positiveInteger(consecutiveFailures, 2),
      consecutiveRecoveries: positiveInteger(consecutiveRecoveries, 2),
      minimumSamples: positiveInteger(minimumSamples, 1),
      noDataState,
      notificationEmail: notificationEmail.trim() || null,
      enabled: initialAlert?.enabled ?? true,
    };

    setSubmitting(true);
    setError(null);
    try {
      const endpoint = initialAlert
        ? `/api/${orgSlug}/observability/alerts/${encodeURIComponent(initialAlert.id)}`
        : `/api/${orgSlug}/observability/alerts`;
      const response = await fetch(endpoint, {
        method: initialAlert ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as
        | { alert?: AlertRecord; error?: string }
        | null;
      if (!response.ok || !result?.alert) {
        throw new Error(result?.error || "Could not save this alert");
      }
      onSaved(result.alert);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save this alert.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const previewAlert: AlertRecord = {
    id: initialAlert?.id || "preview",
    name: name || "Untitled alert",
    description: null,
    signal,
    service,
    environment: environment === "all" ? null : environment,
    metricKey: selectedMetric?.key || null,
    metricName: selectedMetric?.name || null,
    metricType: selectedMetric?.type || null,
    metricUnit: selectedMetric?.unit || null,
    aggregationTemporality: selectedMetric?.aggregationTemporality || null,
    isMonotonic: selectedMetric?.isMonotonic ?? null,
    metricAggregation: metricAggregation as AlertRecord["metricAggregation"],
    logLevel: logLevel as AlertRecord["logLevel"],
    logQuery,
    operator,
    threshold: Number(threshold),
    windowMinutes: positiveInteger(windowMinutes, 5),
    evaluationIntervalSeconds: positiveInteger(evaluationIntervalSeconds, 60),
    consecutiveFailures: positiveInteger(consecutiveFailures, 2),
    consecutiveRecoveries: positiveInteger(consecutiveRecoveries, 2),
    minimumSamples: positiveInteger(minimumSamples, 1),
    noDataState: noDataState as AlertRecord["noDataState"],
    notificationEmail,
    enabled: true,
    state: "healthy",
    underlyingState: "healthy",
    mutedUntil: null,
    currentValue: null,
    sampleCount: 0,
    failureStreak: 0,
    recoveryStreak: 0,
    lastEvaluatedAt: null,
    nextEvaluationAt: null,
    lastStateChangedAt: null,
    lastEvaluationError: null,
    createdAt: "",
    updatedAt: "",
    openIncidentId: null,
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" appearance="flat">
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.025em] text-white">
              {initialAlert ? "Edit alert" : "Create alert"}
            </h2>
            <p className="mt-1 text-xs text-zinc-600">
              Evaluate incoming telemetry against a reliable, repeatable rule.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
            aria-label="Close alert form"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.7} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-6">
          {error && (
            <div className="rounded-xl border border-rose-400/15 bg-rose-400/[0.035] px-4 py-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <FormSection title="Alert details">
            <label className="block">
              <FieldLabel>Name</FieldLabel>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Checkout 5xx rate"
                className={inputClassName}
                autoFocus
              />
            </label>
            <label className="block">
              <FieldLabel>Description</FieldLabel>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this alert protects and who should respond"
                rows={2}
                className={`${inputClassName} min-h-20 resize-none py-3`}
              />
            </label>
          </FormSection>

          <FormSection title="Signal and scope">
            <div>
              <FieldLabel>Signal</FieldLabel>
              <Select
                value={signal}
                onChange={selectSignal}
                ariaLabel="Alert signal"
                icon={
                  <HugeiconsIcon
                    icon={signalIcon(signal)}
                    size={15}
                    strokeWidth={1.7}
                  />
                }
                options={signalOptions}
                className="mt-2"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Service</FieldLabel>
                <Select
                  value={service}
                  onChange={(value) => {
                    setService(value);
                    setEnvironment("all");
                    setMetricKey("");
                  }}
                  ariaLabel="Alert service"
                  disabled={optionsLoading && !availableServices.length}
                  options={availableServices.map((item) => ({
                    value: item,
                    label: item,
                  }))}
                  placeholder={optionsLoading ? "Loading services…" : "Choose service"}
                  className="mt-2"
                />
              </div>
              <div>
                <FieldLabel>Environment</FieldLabel>
                <Select
                  value={environment}
                  onChange={setEnvironment}
                  ariaLabel="Alert environment"
                  options={[
                    { value: "all", label: "All environments" },
                    ...environments.map((item) => ({
                      value: item,
                      label: item,
                    })),
                  ]}
                  className="mt-2"
                />
              </div>
            </div>

            {signal === "metric_value" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Gauge metric</FieldLabel>
                  <Select
                    value={metricKey}
                    onChange={setMetricKey}
                    ariaLabel="Gauge metric"
                    disabled={optionsLoading || !availableMetrics.length}
                    placeholder={
                      optionsLoading ? "Loading metrics…" : "No gauges reported"
                    }
                    options={availableMetrics.map((metric) => ({
                      value: metric.key,
                      label: metric.name,
                      description: [metric.type, metric.unit]
                        .filter(Boolean)
                        .join(" · "),
                    }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <FieldLabel>Aggregation</FieldLabel>
                  <Select
                    value={metricAggregation}
                    onChange={setMetricAggregation}
                    ariaLabel="Metric aggregation"
                    options={[
                      { value: "latest", label: "Latest value" },
                      { value: "avg", label: "Average" },
                      { value: "max", label: "Maximum" },
                      { value: "min", label: "Minimum" },
                    ]}
                    className="mt-2"
                  />
                </div>
              </div>
            )}

            {signal === "log_count" && (
              <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div>
                  <FieldLabel>Log level</FieldLabel>
                  <Select
                    value={logLevel}
                    onChange={setLogLevel}
                    ariaLabel="Log level"
                    options={[
                      { value: "all", label: "All levels" },
                      { value: "debug", label: "Debug" },
                      { value: "info", label: "Info" },
                      { value: "warn", label: "Warning" },
                      { value: "error", label: "Error" },
                    ]}
                    className="mt-2"
                  />
                </div>
                <label>
                  <FieldLabel>Contains</FieldLabel>
                  <input
                    value={logQuery}
                    onChange={(event) => setLogQuery(event.target.value)}
                    placeholder="Optional message search"
                    className={inputClassName}
                  />
                </label>
              </div>
            )}
          </FormSection>

          <FormSection title="Condition">
            {signal === "no_telemetry" ? (
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs leading-5 text-zinc-500">
                Fire when the selected service sends no telemetry during the
                configured window.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <div>
                  <FieldLabel>Operator</FieldLabel>
                  <Select
                    value={operator}
                    onChange={(value) => setOperator(value as AlertOperator)}
                    ariaLabel="Alert operator"
                    options={[
                      { value: "gt", label: "Greater than" },
                      { value: "gte", label: "Greater than or equal" },
                      { value: "lt", label: "Less than" },
                      { value: "lte", label: "Less than or equal" },
                    ]}
                    className="mt-2"
                  />
                </div>
                <label>
                  <FieldLabel>{thresholdLabel(signal, selectedMetric)}</FieldLabel>
                  <input
                    type="number"
                    step="any"
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                    className={inputClassName}
                  />
                </label>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <FieldLabel>Window</FieldLabel>
                <Select
                  value={windowMinutes}
                  onChange={setWindowMinutes}
                  ariaLabel="Evaluation window"
                  options={[
                    { value: "1", label: "1 minute" },
                    { value: "5", label: "5 minutes" },
                    { value: "10", label: "10 minutes" },
                    { value: "15", label: "15 minutes" },
                    { value: "30", label: "30 minutes" },
                    { value: "60", label: "1 hour" },
                  ]}
                  className="mt-2"
                />
              </div>
              <label>
                <FieldLabel>Failures to fire</FieldLabel>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={consecutiveFailures}
                  onChange={(event) => setConsecutiveFailures(event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label>
                <FieldLabel>Recoveries to resolve</FieldLabel>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={consecutiveRecoveries}
                  onChange={(event) => setConsecutiveRecoveries(event.target.value)}
                  className={inputClassName}
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <FieldLabel>Evaluate every</FieldLabel>
                <Select
                  value={evaluationIntervalSeconds}
                  onChange={setEvaluationIntervalSeconds}
                  ariaLabel="Evaluation interval"
                  options={[
                    { value: "60", label: "1 minute" },
                    { value: "300", label: "5 minutes" },
                    { value: "900", label: "15 minutes" },
                  ]}
                  className="mt-2"
                />
              </div>
              <label>
                <FieldLabel>Minimum samples</FieldLabel>
                <input
                  type="number"
                  min="1"
                  value={minimumSamples}
                  onChange={(event) => setMinimumSamples(event.target.value)}
                  className={inputClassName}
                />
              </label>
              <div>
                <FieldLabel>When data is missing</FieldLabel>
                <Select
                  value={noDataState}
                  onChange={setNoDataState}
                  ariaLabel="No data behavior"
                  options={[
                    { value: "no_data", label: "Show no data" },
                    { value: "healthy", label: "Treat as healthy" },
                    { value: "alerting", label: "Treat as firing" },
                  ]}
                  className="mt-2"
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Notification">
            <label className="block">
              <FieldLabel>Email recipient</FieldLabel>
              <input
                type="email"
                value={notificationEmail}
                onChange={(event) => setNotificationEmail(event.target.value)}
                placeholder="on-call@example.com (optional)"
                className={inputClassName}
              />
              <p className="mt-2 text-[11px] leading-5 text-zinc-700">
                OutRay sends firing and recovery notifications to this address.
              </p>
            </label>
          </FormSection>

          <div className="rounded-xl border border-violet-400/15 bg-violet-400/[0.035] px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-violet-300">
              Rule preview
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              {conditionLabel(previewAlert)}. Confirm after {consecutiveFailures}{" "}
              consecutive {consecutiveFailures === "1" ? "evaluation" : "evaluations"}.
            </p>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 rounded-lg px-4 text-xs text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-10 rounded-lg bg-white px-4 text-xs font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? initialAlert
                ? "Saving…"
                : "Creating…"
              : initialAlert
                ? "Save changes"
                : "Create alert"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-white/[0.07] p-4 sm:p-5">
      <h3 className="text-xs font-medium text-zinc-300">{title}</h3>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium text-zinc-500">{children}</span>;
}

const inputClassName =
  "mt-2 h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-xs text-zinc-300 outline-none transition-colors placeholder:text-zinc-800 focus:border-white/[0.16]";

function thresholdLabel(signal: AlertSignal, metric?: MetricOption) {
  if (signal === "request_error_rate") return "Threshold (%)";
  if (signal === "request_latency_p95") return "Threshold (ms)";
  if (signal === "request_throughput") return "Threshold (rpm)";
  if (signal === "log_count") return "Event count";
  if (signal === "metric_value" && metric?.unit) {
    return `Threshold (${metric.unit})`;
  }
  return "Threshold";
}

function positiveInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
