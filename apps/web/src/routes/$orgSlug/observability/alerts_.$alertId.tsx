import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Alert02Icon from "@hugeicons-pro/core-stroke-rounded/Alert02Icon";
import ArrowLeft01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowLeft01Icon";
import Cancel01Icon from "@hugeicons-pro/core-stroke-rounded/Cancel01Icon";
import Delete02Icon from "@hugeicons-pro/core-stroke-rounded/Delete02Icon";
import Notification02Icon from "@hugeicons-pro/core-stroke-rounded/Notification02Icon";
import PauseIcon from "@hugeicons-pro/core-stroke-rounded/PauseIcon";
import PencilEdit02Icon from "@hugeicons-pro/core-stroke-rounded/PencilEdit02Icon";
import PlayIcon from "@hugeicons-pro/core-stroke-rounded/PlayIcon";
import RefreshIcon from "@hugeicons-pro/core-stroke-rounded/RefreshIcon";
import Settings02Icon from "@hugeicons-pro/core-stroke-rounded/Settings02Icon";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ObservabilityPage,
  Panel,
} from "@/components/observability/observability-ui";
import { Modal } from "@/components/ui/modal";
import {
  AlertDetailContext,
  useAlertDetail,
  type AlertDetailsResponse,
  type AlertEvaluation,
  type AlertIncident,
} from "@/components/observability/alert-detail-context";
import {
  AlertFormModal,
  AlertIcon,
  AlertStatePill,
  type AlertRecord,
  type AlertState,
} from "./alerts";

const detailTabs = [
  { label: "Overview", to: "/$orgSlug/observability/alerts/$alertId" },
  { label: "Condition", to: "/$orgSlug/observability/alerts/$alertId/condition" },
  { label: "Evaluations", to: "/$orgSlug/observability/alerts/$alertId/evaluations" },
  { label: "Incidents", to: "/$orgSlug/observability/alerts/$alertId/incidents" },
  { label: "Notifications", to: "/$orgSlug/observability/alerts/$alertId/notifications" },
] as const;

export const Route = createFileRoute(
  "/$orgSlug/observability/alerts_/$alertId",
)({
  head: () => ({ meta: [{ title: "Alert - OutRay Observability" }] }),
  component: AlertDetailView,
});

function AlertDetailView() {
  const { orgSlug, alertId } = Route.useParams();
  const navigate = Route.useNavigate();
  const [data, setData] = useState<AlertDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let refreshTimeout: number | undefined;

    const loadAlert = async () => {
      setRefreshing(true);
      try {
        const response = await fetch(
          `/api/${orgSlug}/observability/alerts/${encodeURIComponent(alertId)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(
            response.status === 404 ? "Alert not found" : "Could not load alert",
          );
        }
        const nextData = (await response.json()) as AlertDetailsResponse;
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
        if (!disposed) {
          setError(
            requestError instanceof Error && requestError.message === "Alert not found"
              ? "This alert does not exist or you no longer have access to it."
              : "Alert details are temporarily unavailable.",
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
          setRefreshing(false);
          refreshTimeout = window.setTimeout(() => void loadAlert(), 10_000);
        }
      }
    };

    void loadAlert();
    return () => {
      disposed = true;
      controller.abort();
      if (refreshTimeout !== undefined) window.clearTimeout(refreshTimeout);
    };
  }, [alertId, orgSlug, reloadKey]);

  const mutateAlert = async (
    actionName: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) => {
    setAction(actionName);
    setActionError(null);
    setActionNotice(null);
    try {
      const response = await fetch(
        `/api/${orgSlug}/observability/alerts/${encodeURIComponent(alertId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json().catch(() => null)) as
        | { alert?: AlertRecord; error?: string }
        | null;
      if (!response.ok || !result?.alert) {
        throw new Error(result?.error || "Could not update this alert");
      }
      setData((current) =>
        current ? { ...current, alert: result.alert as AlertRecord } : current,
      );
      setActionNotice(successMessage);
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update this alert.",
      );
    } finally {
      setAction(null);
    }
  };

  const runNow = async () => {
    setAction("evaluate");
    setActionError(null);
    setActionNotice(null);
    try {
      const response = await fetch(
        `/api/${orgSlug}/observability/alerts/${encodeURIComponent(alertId)}/evaluate`,
        { method: "POST" },
      );
      const result = (await response.json().catch(() => null)) as
        | {
            error?: string;
            alreadyEvaluated?: boolean;
            evaluationInProgress?: boolean;
          }
        | null;
      if (!response.ok) {
        throw new Error(result?.error || "Could not queue an evaluation");
      }
      if (result?.alreadyEvaluated) {
        setActionNotice("The current telemetry window has already been evaluated.");
      } else if (result?.evaluationInProgress) {
        setActionNotice("An evaluation is already in progress.");
      } else {
        setActionNotice("Evaluation queued. Results will appear shortly.");
        window.setTimeout(() => setReloadKey((value) => value + 1), 1_200);
      }
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Could not queue an evaluation.",
      );
    } finally {
      setAction(null);
    }
  };

  if (loading && !data) return <AlertDetailSkeleton orgSlug={orgSlug} />;

  if (!data) {
    return (
      <ObservabilityPage>
        <Link
          to="/$orgSlug/observability/alerts"
          params={{ orgSlug }}
          className="inline-flex items-center gap-2 text-xs text-zinc-600 transition-colors hover:text-zinc-300"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.7} />
          All alerts
        </Link>
        <div className="rounded-xl border border-white/[0.07] px-6 py-16 text-center">
          <p className="text-sm font-medium text-rose-400">
            {error || "Alert details are unavailable."}
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setReloadKey((value) => value + 1);
            }}
            className="mt-5 h-9 rounded-lg bg-white px-4 text-xs font-medium text-black hover:bg-zinc-200"
          >
            Try again
          </button>
        </div>
      </ObservabilityPage>
    );
  }

  const { alert } = data;
  const effectiveState = getEffectiveState(alert);
  const muted = effectiveState === "muted";

  return (
    <AlertDetailContext.Provider value={{ data, refreshing, orgSlug, onEditCondition: () => setIsEditing(true), onEditDetails: () => setIsEditingDetails(true), onReload: () => setReloadKey((value) => value + 1) }}>
    <ObservabilityPage>
      <header className="border-b border-white/[0.07] pb-7">
        <Link
          to="/$orgSlug/observability/alerts"
          params={{ orgSlug }}
          className="mb-5 inline-flex items-center gap-2 text-xs text-zinc-600 transition-colors hover:text-zinc-300"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.7} />
          All alerts
        </Link>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <AlertIcon alert={alert} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-2xl font-semibold tracking-[-0.035em] text-white">
                  {alert.name}
                </h1>
                <AlertStatePill alert={alert} />
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                {alert.description || conditionLabel(alert)}
              </p>
              {effectiveState === "muted" && alert.underlyingState && (
                <p className="mt-2 text-xs text-violet-300">
                  Evaluations continue while muted. Underlying state:{" "}
                  {alert.underlyingState.replace("_", " ")}.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              icon={RefreshIcon}
              label={action === "evaluate" ? "Running…" : "Run now"}
              onClick={() => void runNow()}
              disabled={Boolean(action) || !alert.enabled}
            />
            <ActionButton
              icon={alert.enabled ? PauseIcon : PlayIcon}
              label={
                action === "enabled"
                  ? "Saving…"
                  : alert.enabled
                    ? "Pause"
                    : "Resume"
              }
              onClick={() =>
                void mutateAlert(
                  "enabled",
                  { enabled: !alert.enabled },
                  alert.enabled ? "Alert paused." : "Alert resumed.",
                )
              }
              disabled={Boolean(action)}
            />
            <ActionButton
              icon={Notification02Icon}
              label={action === "mute" ? "Saving…" : muted ? "Unmute" : "Mute 1h"}
              onClick={() =>
                void mutateAlert(
                  "mute",
                  {
                    mutedUntil: muted
                      ? null
                      : new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
                  },
                  muted
                    ? "Alert notifications unmuted."
                    : "Alert notifications muted for one hour.",
                )
              }
              disabled={Boolean(action) || !alert.enabled}
            />
            <ActionButton
              icon={Delete02Icon}
              label="Delete"
              onClick={() => setIsDeleting(true)}
              disabled={Boolean(action)}
              tone="danger"
            />
          </div>
        </div>
      </header>

      <nav aria-label="Alert details" className="overflow-x-auto border-b border-white/[0.07]">
        <div className="flex min-w-max items-center gap-7">
          {detailTabs.map((tab) => (
            <Link
              key={tab.label}
              to={tab.to}
              params={{ orgSlug, alertId }}
              activeOptions={{ exact: true }}
              className="border-b-2 border-transparent pb-3 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-200"
              activeProps={{ className: "!border-violet-400 !text-white" }}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>

      {(error || actionNotice || actionError) && (
        <div
          className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-xs ${
            actionError
              ? "border-rose-400/15 bg-rose-400/[0.035] text-rose-300"
              : error
                ? "border-amber-400/15 bg-amber-400/[0.035] text-amber-300"
                : "border-emerald-400/15 bg-emerald-400/[0.035] text-emerald-300"
          }`}
        >
          <span>
            {actionError ||
              actionNotice ||
              `${error} Showing the last successful result${
                lastSuccessAt ? ` from ${formatClockTime(lastSuccessAt)}.` : "."
              }`}
          </span>
          {error && (
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="shrink-0 font-medium hover:text-white"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {alert.lastEvaluationError && (
        <div className="rounded-xl border border-rose-400/15 bg-rose-400/[0.035] px-4 py-3 text-xs text-rose-300">
          Last evaluation failed: {alert.lastEvaluationError}
        </div>
      )}

      <Outlet />
      <AlertFormModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        orgSlug={orgSlug}
        services={alert.service ? [alert.service] : []}
        initialAlert={alert}
        mode="condition"
        onSaved={(updatedAlert) => {
          setData((current) =>
            current ? { ...current, alert: updatedAlert } : current,
          );
          setIsEditing(false);
          setActionNotice("Alert updated.");
          setReloadKey((value) => value + 1);
        }}
      />

      <AlertDetailsEditModal
        isOpen={isEditingDetails}
        onClose={() => setIsEditingDetails(false)}
        alert={alert}
        orgSlug={orgSlug}
        onSaved={(updatedAlert) => {
          setData((current) => current ? { ...current, alert: updatedAlert } : current);
          setIsEditingDetails(false);
          setActionNotice("Alert details updated.");
          setReloadKey((value) => value + 1);
        }}
      />

      <DeleteAlertModal
        isOpen={isDeleting}
        alert={alert}
        orgSlug={orgSlug}
        onClose={() => setIsDeleting(false)}
        onDeleted={() =>
          void navigate({
            to: "/$orgSlug/observability/alerts",
            params: { orgSlug },
          })
        }
      />
    </ObservabilityPage>
    </AlertDetailContext.Provider>
  );
}

function AlertDetailsEditModal({
  isOpen,
  onClose,
  alert,
  orgSlug,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  alert: AlertRecord;
  orgSlug: string;
  onSaved: (alert: AlertRecord) => void;
}) {
  const [name, setName] = useState(alert.name);
  const [description, setDescription] = useState(alert.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(alert.name);
    setDescription(alert.description || "");
    setError(null);
  }, [alert.name, alert.description, isOpen]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alert.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });
      const result = await response.json() as { alert?: AlertRecord; error?: string };
      if (!response.ok || !result.alert) throw new Error(result.error || "Could not save alert details");
      onSaved(result.alert);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save alert details");
    } finally {
      setSaving(false);
    }
  };

  return <Modal isOpen={isOpen} onClose={onClose} size="md" appearance="flat">
    <form onSubmit={(event) => void save(event)} className="space-y-5 p-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Edit alert details</h2>
        <p className="mt-1 text-sm text-zinc-500">Update the name and description without changing its condition.</p>
      </div>
      <label className="block text-xs text-zinc-400">Name
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required className="mt-2 h-10 w-full rounded-lg border border-white/[0.1] bg-white/[0.025] px-3 text-sm text-zinc-200 outline-none focus:border-violet-400/50" />
      </label>
      <label className="block text-xs text-zinc-400">Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-lg border border-white/[0.1] bg-white/[0.025] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-400/50" />
      </label>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-xs text-zinc-400 hover:text-white">Cancel</button>
        <button type="submit" disabled={saving || !name.trim()} className="h-9 rounded-lg bg-white px-4 text-xs font-medium text-black hover:bg-zinc-200 disabled:opacity-50">{saving ? "Saving…" : "Save details"}</button>
      </div>
    </form>
  </Modal>;
}

export function AlertOverviewTab() {
  const { data, refreshing, onEditDetails } = useAlertDetail();
  const { alert, evaluations, incidents, notifications } = data;
  const effectiveState = getEffectiveState(alert);

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-zinc-100">Overview</h2>
        <button type="button" onClick={onEditDetails} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-xs font-medium text-zinc-200 hover:bg-white/[0.06]">
          <HugeiconsIcon icon={PencilEdit02Icon} size={15} strokeWidth={1.7} />
          Edit details
        </button>
      </div>
      <section
        aria-label="Alert at a glance"
        className="grid gap-px overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 xl:grid-cols-4"
      >
        <DetailMetric
          label="Current value"
          value={formatAlertValue(alert.currentValue, alert)}
          detail={signalLabel(alert.signal)}
          tone={effectiveState === "firing" ? "rose" : "neutral"}
        />
        <DetailMetric
          label={alert.signal === "no_telemetry" ? "Quiet window" : "Threshold"}
          value={alert.signal === "no_telemetry" ? formatWindow(alert.windowMinutes) : formatAlertValue(alert.threshold, alert)}
          detail={alert.signal === "no_telemetry" ? "Without telemetry" : operatorText(alert.operator)}
        />
        <DetailMetric
          label="Last evaluated"
          value={formatRelativeTime(alert.lastEvaluatedAt)}
          detail={
            alert.nextEvaluationAt
              ? `Next ${formatRelativeFuture(alert.nextEvaluationAt)}`
              : "No evaluation scheduled"
          }
        />
        <DetailMetric
          label="Open incident"
          value={alert.openIncidentId ? "Active" : "None"}
          detail={alert.openIncidentId || "No unresolved incident"}
          tone={alert.openIncidentId ? "rose" : "neutral"}
        />
      </section>

      <Panel
        title="Evaluation trend"
        description="Observed values against the configured threshold"
        action={
          <span className="text-xs text-zinc-500">
            {refreshing ? "Updating…" : `${evaluations.length} recent evaluations`}
          </span>
        }
      >
        <EvaluationChart alert={alert} evaluations={evaluations} />
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Incidents" description="Firing and recovery history">
          <div className="px-5 py-5 sm:px-6">
            <p className="text-2xl font-semibold text-zinc-200">{incidents.length}</p>
            <p className="mt-1 text-sm text-zinc-500">Recent incidents for this alert</p>
          </div>
        </Panel>
        <Panel title="Notifications" description="Delivery attempts">
          <div className="px-5 py-5 sm:px-6">
            <p className="text-2xl font-semibold text-zinc-200">{notifications.length}</p>
            <p className="mt-1 text-sm text-zinc-500">Recent notification attempts</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function AlertConditionTab() {
  const { data, onEditCondition } = useAlertDetail();
  const { alert } = data;

  return (
    <div className="space-y-6">
      <TabHeading
        title="Condition"
        description="The signal, scope, and evaluation rules for this alert."
      />
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-violet-400/15 bg-violet-400/[0.035] px-5 py-4 text-sm leading-6 text-zinc-300 sm:px-6">
        <span>{conditionLabel(alert)}</span>
        <button type="button" onClick={onEditCondition} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.06]">
          <HugeiconsIcon icon={PencilEdit02Icon} size={15} strokeWidth={1.7} />
          Edit condition
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Signal and scope">
          <div className="divide-y divide-white/[0.06] px-5 sm:px-6">
            <DetailRow label="Signal" value={signalLabel(alert.signal)} />
            <DetailRow label="Service" value={alert.service} />
            <DetailRow label="Environment" value={alert.environment || "All environments"} />
            {alert.signal === "metric_value" && (
              <>
                <DetailRow label="Metric" value={alert.metricName || alert.metricKey || "—"} />
                <DetailRow label="Aggregation" value={alert.metricAggregation || "—"} />
              </>
            )}
            {alert.signal === "log_count" && (
              <>
                <DetailRow label="Log level" value={alert.logLevel || "All levels"} />
                <DetailRow label="Contains" value={alert.logQuery || "Any message"} />
              </>
            )}
          </div>
        </Panel>
        <Panel title="Evaluation behavior">
          <div className="divide-y divide-white/[0.06] px-5 sm:px-6">
            {alert.signal !== "no_telemetry" && (
              <>
                <DetailRow label="Operator" value={operatorText(alert.operator)} />
                <DetailRow label="Threshold" value={formatAlertValue(alert.threshold, alert)} />
              </>
            )}
            <DetailRow label="Window" value={formatWindow(alert.windowMinutes)} />
            <DetailRow label="Evaluate every" value={formatWindow(alert.evaluationIntervalSeconds / 60)} />
            <DetailRow label="Failures to fire" value={String(alert.consecutiveFailures)} />
            <DetailRow label="Recoveries to resolve" value={String(alert.consecutiveRecoveries)} />
            <DetailRow label="Minimum samples" value={alert.minimumSamples.toLocaleString()} />
            <DetailRow label="When data is missing" value={noDataLabel(alert.noDataState)} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function AlertEvaluationsTab() {
  const { data, refreshing } = useAlertDetail();
  const { alert, evaluations } = data;

  return (
    <div className="space-y-6">
      <TabHeading
        title="Evaluations"
        description="Each decision made against the alert condition."
        count={evaluations.length}
      />
      <Panel title="Observed values" description="Values compared with the alert threshold">
        <EvaluationChart alert={alert} evaluations={evaluations} />
      </Panel>
      <Panel
        title="Evaluation history"
        description="Most recent decisions first"
        action={refreshing ? <span className="text-xs text-zinc-500">Updating…</span> : undefined}
      >
        <div className="hidden grid-cols-[150px_110px_120px_100px_minmax(0,1fr)] gap-4 border-b border-white/[0.07] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-600 sm:px-6 lg:grid">
          <span>Evaluated</span>
          <span>State</span>
          <span>Value</span>
          <span>Samples</span>
          <span>Result</span>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {evaluations.length === 0 ? (
            <EmptyPanel message="No evaluations have run yet." />
          ) : (
            evaluations.map((evaluation) => (
              <div
                key={evaluation.id}
                className="grid gap-3 px-5 py-4 sm:px-6 lg:grid-cols-[150px_110px_120px_100px_minmax(0,1fr)] lg:items-center lg:gap-4"
              >
                <span className="text-xs text-zinc-500">
                  {formatDateTime(evaluationTime(evaluation))}
                </span>
                <EvaluationState
                  state={evaluation.resultingState || evaluation.state || evaluation.status || "no_data"}
                />
                <span className="font-mono text-xs text-zinc-400">
                  {formatAlertValue(evaluation.value, alert)}
                </span>
                <span className="text-xs text-zinc-500">
                  {evaluation.sampleCount?.toLocaleString() ?? "—"}
                </span>
                <span className={`text-xs ${evaluation.error ? "text-rose-400" : "text-zinc-500"}`}>
                  {evaluation.error || evaluation.message || "Evaluation completed"}
                </span>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

export function AlertIncidentsTab() {
  const { data } = useAlertDetail();
  const { alert, incidents } = data;

  return (
    <div className="space-y-6">
      <TabHeading
        title="Incidents"
        description="When this alert fired and when it recovered."
        count={incidents.length}
      />
      <Panel title="Incident history" description="Most recent incidents first">
        <div className="divide-y divide-white/[0.06]">
          {incidents.length === 0 ? (
            <EmptyPanel message="No incidents have been opened." />
          ) : (
            incidents.map((incident) => (
              <div key={incident.id} className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:gap-5 sm:px-6">
                <span className={`size-2 shrink-0 rounded-full ${incident.status === "open" ? "bg-rose-400" : "bg-emerald-400"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize text-zinc-200">{incident.status} incident</p>
                  <p className="mt-1 text-xs text-zinc-500">Started {formatDateTime(incidentStart(incident))}</p>
                  {incident.resolvedAt && (
                    <p className="mt-1 text-xs text-zinc-500">Resolved {formatDateTime(incident.resolvedAt)}</p>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="font-mono text-sm text-zinc-300">
                    {formatAlertValue(incident.lastValue ?? incident.triggerValue, alert)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">Last observed value</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

export function AlertNotificationsTab() {
  const { data, orgSlug, onReload } = useAlertDetail();
  const { alert, notifications } = data;
  const [editingEmail, setEditingEmail] = useState(false);
  const [email, setEmail] = useState(alert.notificationEmail || "");
  const [settingsProvider, setSettingsProvider] = useState<"slack" | "discord" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const integrationResult = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("integration");

  useEffect(() => {
    if (!editingEmail) setEmail(alert.notificationEmail || "");
  }, [alert.notificationEmail, editingEmail]);

  const base = `/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alert.id)}/integrations`;
  const saveEmail = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alert.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notificationEmail: email.trim() || null }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save email notifications");
      setEditingEmail(false);
      setNotice("Email destination updated.");
      onReload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save email notifications");
    } finally {
      setSaving(false);
    }
  };
  const disconnect = async (provider: "slack" | "discord") => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${base}/${provider}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Could not disconnect ${provider}`);
      setSettingsProvider(null);
      setNotice(`${provider === "slack" ? "Slack" : "Discord"} removed from this alert.`);
      onReload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not disconnect destination");
    } finally {
      setSaving(false);
    }
  };
  const selectedTarget = settingsProvider === "slack"
    ? alert.notificationSlackTarget
    : alert.notificationDiscordTarget;

  return (
    <div className="space-y-6">
      <TabHeading
        title="Notifications"
        description="Where alert updates go and the outcome of each delivery attempt."
        count={notifications.length}
      />
      {(error || notice || integrationResult) && (
        <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${error || integrationResult === "failed" || integrationResult === "invalid_state" ? "border-rose-400/20 text-rose-300" : "border-emerald-400/20 text-emerald-300"}`}>
          {error || notice || (integrationResult === "connected" ? "Destination connected. Alerts will be delivered to the selected channel." : integrationResult === "cancelled" ? "Connection cancelled." : "Could not connect the destination. Please try again.")}
        </p>
      )}
      <Panel title="Notification methods" description="Choose where firing and recovery updates should go.">
        <div className="divide-y divide-white/[0.07]">
          <div className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-300">
              <HugeiconsIcon icon={Notification02Icon} size={19} strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-100">Email</p>
              <p className="mt-1 text-xs text-zinc-500">{alert.notificationEmail || "No recipient configured"}</p>
            </div>
            <button type="button" onClick={() => { setEditingEmail((value) => !value); setError(null); }} className="h-9 rounded-lg border border-white/[0.1] px-3 text-xs font-medium text-zinc-200 hover:bg-white/[0.06]">
              {editingEmail ? "Cancel" : alert.notificationEmail ? "Edit" : "Add email"}
            </button>
            {editingEmail && <div className="flex w-full flex-wrap items-center gap-2 pl-0 sm:pl-[60px]">
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Member email address" aria-label="Notification email" className="h-10 min-w-52 flex-1 rounded-lg border border-white/[0.1] bg-white/[0.025] px-3 text-sm text-zinc-200 outline-none focus:border-violet-400/50" />
              <button type="button" disabled={saving} onClick={() => void saveEmail()} className="h-10 rounded-lg bg-white px-4 text-xs font-medium text-black hover:bg-zinc-200 disabled:opacity-50">Save</button>
            </div>}
          </div>
          {(["slack", "discord"] as const).map((provider) => {
            const connected = provider === "slack" ? alert.notificationSlackConfigured : alert.notificationDiscordConfigured;
            const target = provider === "slack" ? alert.notificationSlackTarget : alert.notificationDiscordTarget;
            const available = data.integrationAvailability?.[provider];
            const title = provider === "slack" ? "Slack" : "Discord";
            return <div key={provider} className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
                <img src={`/logos/${provider}.svg`} alt="" className="size-6 object-contain" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100">{title}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {connected
                    ? provider === "slack"
                      ? [target?.workspaceName, target?.channelName].filter(Boolean).join(" · ") || "Connected channel"
                      : target?.channelId ? `Channel ${target.channelId}` : "Connected channel"
                    : available ? "Connect and select a channel" : "OAuth app not configured"}
                </p>
              </div>
              {connected ? <button type="button" onClick={() => setSettingsProvider(provider)} aria-label={`${title} settings`} className="flex size-9 items-center justify-center rounded-lg border border-white/[0.1] text-zinc-300 hover:bg-white/[0.06]">
                <HugeiconsIcon icon={Settings02Icon} size={17} strokeWidth={1.7} />
              </button> : available ? <a href={`${base}/${provider}/start`} className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-xs font-medium text-black hover:bg-zinc-200">Connect</a> : null}
            </div>;
          })}
        </div>
      </Panel>
      <Panel title="Delivery history" description="Most recent attempts first">
        <div className="divide-y divide-white/[0.06]">
          {notifications.length === 0 ? (
            <EmptyPanel message="No notifications have been sent." />
          ) : (
            notifications.map((notification) => (
              <div key={notification.id} className="flex items-start gap-4 px-5 py-5 sm:px-6">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-500">
                  <HugeiconsIcon icon={Notification02Icon} size={15} strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm text-zinc-300">
                    {notification.channel === "slack"
                      ? "Slack webhook"
                      : notification.channel === "discord"
                        ? "Discord webhook"
                        : notification.destination || notification.recipient || alert.notificationEmail || "Email recipient"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDateTime(notification.sentAt || notification.createdAt || null)}
                    {notification.type ? ` · ${notification.type}` : ""}
                  </p>
                  {(notification.error || notification.lastError) && (
                    <p className="mt-2 text-xs text-rose-300">{notification.error || notification.lastError}</p>
                  )}
                </div>
                <span className={`shrink-0 text-xs capitalize ${
                  notification.status === "sent" || notification.status === "delivered"
                    ? "text-emerald-400"
                    : notification.status === "failed"
                      ? "text-rose-400"
                      : notification.status === "suppressed"
                        ? "text-zinc-500"
                        : "text-amber-400"
                }`}>
                  {notification.status}
                </span>
              </div>
            ))
          )}
        </div>
      </Panel>
      <Modal isOpen={settingsProvider !== null} onClose={() => setSettingsProvider(null)} size="sm" appearance="flat">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-white">{settingsProvider === "slack" ? "Slack" : "Discord"} settings</h3>
          <p className="mt-2 text-sm text-zinc-500">Alerts are sent to the channel selected during authorization. Removing this destination stops delivery for this alert; provider-side app access can be managed in Slack or Discord.</p>
          <dl className="mt-5 space-y-3 rounded-xl border border-white/[0.08] p-4 text-sm">
            {settingsProvider === "slack" && <div><dt className="text-zinc-500">Workspace</dt><dd className="mt-1 text-zinc-200">{alert.notificationSlackTarget?.workspaceName || "Connected workspace"}</dd></div>}
            <div><dt className="text-zinc-500">Channel</dt><dd className="mt-1 text-zinc-200">{settingsProvider === "slack" ? selectedTarget?.channelName || selectedTarget?.channelId || "Selected channel" : selectedTarget?.channelId || "Selected channel"}</dd></div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-2">
            {settingsProvider && <a href={`${base}/${settingsProvider}/start`} className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-xs font-medium text-black hover:bg-zinc-200">Change channel</a>}
            {settingsProvider && <button type="button" disabled={saving} onClick={() => void disconnect(settingsProvider)} className="h-9 rounded-lg border border-rose-400/20 px-3 text-xs font-medium text-rose-300 hover:bg-rose-400/[0.06] disabled:opacity-50">Remove from alert</button>}
            <button type="button" onClick={() => setSettingsProvider(null)} className="h-9 rounded-lg px-3 text-xs text-zinc-400 hover:text-white">Close</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TabHeading({
  title,
  description,
  count,
}: {
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      {count !== undefined && (
        <span className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-zinc-500">
          {count} recent
        </span>
      )}
    </div>
  );
}

function EvaluationChart({
  alert,
  evaluations,
}: {
  alert: AlertRecord;
  evaluations: AlertEvaluation[];
}) {
  const points = useMemo(
    () =>
      evaluations
        .map((evaluation) => ({
          timestamp: evaluationTime(evaluation),
          value: evaluation.value,
        }))
        .filter((point) => point.timestamp)
        .sort(
          (left, right) =>
            new Date(left.timestamp as string).getTime() -
            new Date(right.timestamp as string).getTime(),
        ),
    [evaluations],
  );

  if (!points.length) {
    return <EmptyPanel message="Evaluated values will appear here after the first run." />;
  }

  return (
    <div className="h-72 px-4 pb-5 pt-6 sm:px-6" role="img" aria-label="Alert evaluation values and threshold">
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 320, height: 288 }}
      >
        <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="alert-value-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.24} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="rgba(255,255,255,0.045)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="timestamp"
            axisLine={false}
            tickLine={false}
            minTickGap={36}
            tick={{ fill: "#52525b", fontSize: 10 }}
            tickFormatter={(value) => formatShortTime(String(value))}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={52}
            tick={{ fill: "#52525b", fontSize: 10 }}
            tickFormatter={(value) => formatAlertValue(Number(value), alert)}
          />
          <Tooltip
            contentStyle={{
              background: "#111111",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              color: "#d4d4d8",
              fontSize: 12,
            }}
            labelFormatter={(value) => formatDateTime(String(value))}
            formatter={(value) => [
              formatAlertValue(Number(value), alert),
              "Observed",
            ]}
          />
          {alert.signal !== "no_telemetry" && (
            <ReferenceLine
              y={alert.threshold}
              ifOverflow="extendDomain"
              stroke="#fb7185"
              strokeDasharray="5 5"
              label={{
                value: `Threshold ${formatAlertValue(alert.threshold, alert)}`,
                position: "insideTopRight",
                fill: "#fb7185",
                fontSize: 10,
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            connectNulls={false}
            stroke="#8b5cf6"
            strokeWidth={1.8}
            fill="url(#alert-value-fill)"
            activeDot={{ r: 3, fill: "#8b5cf6", stroke: "#090909" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  tone = "neutral",
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === "danger"
          ? "border-rose-400/15 text-rose-400 hover:bg-rose-400/[0.07]"
          : "border-white/[0.08] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
      }`}
    >
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.7} />
      {label}
    </button>
  );
}

function DetailMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "rose";
}) {
  return (
    <div className="min-w-0 bg-[#080808] px-5 py-5 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-2 truncate text-xl font-semibold tracking-[-0.035em] ${tone === "rose" ? "text-rose-400" : "text-zinc-200"}`}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-5 py-4">
      <span className="text-xs text-zinc-700">{label}</span>
      <span className="max-w-[65%] break-words text-right text-xs text-zinc-400">
        {value}
      </span>
    </div>
  );
}

function EvaluationState({ state }: { state: string }) {
  const normalized = state === "noData" ? "no_data" : state;
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
      className={`inline-flex items-center gap-2 text-xs capitalize ${styles[normalized] || "text-zinc-500"}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {normalized.replace("_", " ")}
    </span>
  );
}

function EmptyPanel({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div className={`px-6 text-center text-xs text-zinc-700 ${compact ? "py-10" : "py-16"}`}>
      {message}
    </div>
  );
}

function AlertDetailSkeleton({ orgSlug }: { orgSlug: string }) {
  return (
    <ObservabilityPage>
      <Link
        to="/$orgSlug/observability/alerts"
        params={{ orgSlug }}
        className="inline-flex items-center gap-2 text-xs text-zinc-600"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.7} />
        All alerts
      </Link>
      <div className="animate-pulse space-y-7" aria-busy="true">
        <header className="border-b border-white/[0.07] pb-7">
          <div className="flex items-center gap-4">
            <span className="size-11 rounded-lg bg-white/[0.055]" />
            <div className="space-y-3">
              <div className="h-6 w-56 rounded bg-white/[0.07]" />
              <div className="h-3 w-80 max-w-full rounded bg-white/[0.04]" />
            </div>
          </div>
        </header>
        <div className="flex gap-7 border-b border-white/[0.07] pb-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-4 w-20 rounded bg-white/[0.04]" />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-white/[0.07] bg-white/[0.015]" />
      </div>
    </ObservabilityPage>
  );
}

function DeleteAlertModal({
  isOpen,
  alert,
  orgSlug,
  onClose,
  onDeleted,
}: {
  isOpen: boolean;
  alert: AlertRecord;
  orgSlug: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/${orgSlug}/observability/alerts/${encodeURIComponent(alert.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(result?.error || "Could not delete this alert");
      }
      onDeleted();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not delete this alert.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" appearance="flat">
      <header className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.025em] text-white">
            Delete alert
          </h2>
          <p className="mt-1 text-xs text-zinc-600">This cannot be undone.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300"
          aria-label="Close delete alert"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.7} />
        </button>
      </header>
      <div className="px-5 py-6">
        <div className="flex items-start gap-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.035] px-4 py-4">
          <HugeiconsIcon
            icon={Alert02Icon}
            size={17}
            strokeWidth={1.8}
            className="mt-0.5 shrink-0 text-rose-400"
          />
          <p className="text-xs leading-5 text-zinc-400">
            Delete <span className="font-medium text-zinc-200">{alert.name}</span>{" "}
            and stop all future evaluations. Existing incident history will no
            longer be available from this page.
          </p>
        </div>
        {error && <p className="mt-4 text-xs text-rose-400">{error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={deleting}
          className="h-9 rounded-lg px-4 text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={deleting}
          className="h-9 rounded-lg bg-rose-500 px-4 text-xs font-medium text-white hover:bg-rose-400 disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete alert"}
        </button>
      </footer>
    </Modal>
  );
}

function evaluationTime(evaluation: AlertEvaluation) {
  return evaluation.evaluatedAt || evaluation.createdAt || evaluation.timestamp || null;
}

function incidentStart(incident: AlertIncident) {
  return incident.startedAt || incident.openedAt || incident.createdAt || null;
}

function operatorText(operator: AlertRecord["operator"]) {
  return (
    {
      gt: "Greater than",
      gte: "Greater than or equal",
      lt: "Less than",
      lte: "Less than or equal",
    } as const
  )[operator];
}

function noDataLabel(value: AlertRecord["noDataState"]) {
  return {
    no_data: "Show no data",
    healthy: "Treat as healthy",
    alerting: "Treat as firing",
  }[value];
}

function formatWindow(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Unknown";
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function formatShortTime(value: string) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function formatClockTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function formatRelativeFuture(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "evaluation unknown";
  const seconds = Math.max(0, Math.ceil((timestamp - Date.now()) / 1_000));
  if (seconds < 60) return `in ${seconds}s`;
  return `in ${Math.ceil(seconds / 60)}m`;
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

function signalLabel(signal: AlertRecord["signal"]) {
  return {
    request_error_rate: "5xx error rate",
    request_latency_p95: "P95 request latency",
    request_throughput: "Request throughput",
    metric_value: "Metric value",
    log_count: "Log count",
    no_telemetry: "No telemetry",
  }[signal];
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
  const operator = ({ gt: ">", gte: "≥", lt: "<", lte: "≤" } as const)[
    alert.operator
  ];
  return `${subject} ${operator} ${formatAlertValue(alert.threshold, alert)} for ${formatWindow(alert.windowMinutes)}`;
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
  if (alert.signal === "request_latency_p95") {
    return numeric >= 1_000
      ? `${formatNumber(numeric / 1_000)}s`
      : `${formatNumber(numeric)}ms`;
  }
  if (alert.signal === "request_throughput") return `${formatNumber(numeric)} rpm`;
  if (alert.signal === "log_count") return numeric.toLocaleString();
  if (alert.signal === "metric_value") {
    return `${formatNumber(numeric)}${alert.metricUnit ? ` ${alert.metricUnit}` : ""}`;
  }
  return formatNumber(numeric);
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
  return `${Math.floor(hours / 24)}d ago`;
}
