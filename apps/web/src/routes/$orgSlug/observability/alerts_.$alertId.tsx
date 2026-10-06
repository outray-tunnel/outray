import { createFileRoute, Link, Outlet, useSearch } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import Alert02Icon from "@hugeicons-pro/core-stroke-rounded/Alert02Icon";
import ArrowLeft01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowLeft01Icon";
import Delete02Icon from "@hugeicons-pro/core-stroke-rounded/Delete02Icon";
import Notification02Icon from "@hugeicons-pro/core-stroke-rounded/Notification02Icon";
import PauseIcon from "@hugeicons-pro/core-solid-rounded/PauseIcon";
import PencilEdit02Icon from "@hugeicons-pro/core-stroke-rounded/PencilEdit02Icon";
import PlayIcon from "@hugeicons-pro/core-solid-rounded/PlayIcon";
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
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { WorkspaceInput, WorkspaceTextarea } from "@/components/ui/workspace-input";
import { startAlertDetailPolling } from "@/components/observability/alert-detail-polling";
import { AlertStateBadge } from "@/components/observability/alert-status-badge";
import { conditionLabel, formatAlertValue, formatClockTime, formatRelativeTime, formatWindow, getEffectiveState, normalizeAlertsSearch, signalLabel } from "@/components/observability/alerts-data";
import "@/components/outray-arc-theme.css";
import { AlertEmailRecipients } from "@/components/observability/alert-email-recipients";
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
  return <AlertDetailWorkspace key={`${orgSlug}:${alertId}`} orgSlug={orgSlug} alertId={alertId} />;
}

function AlertDetailWorkspace({ orgSlug, alertId }: { orgSlug: string; alertId: string }) {
  const navigate = Route.useNavigate();
  const reducedMotion = useReducedMotion();
  const tabsId = useId();
  const listSearch = normalizeAlertsSearch(useSearch({ strict: false }));
  const evaluationRefresh = useRef<number | undefined>(undefined);
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
    return startAlertDetailPolling({
      url: `/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alertId)}`,
      onStart: () => setRefreshing(true),
      onData: (nextData) => {
        setData(nextData);
        setLastSuccessAt(Date.now());
        setError(null);
      },
      onError: setError,
      onComplete: () => { setLoading(false); setRefreshing(false); },
    });
  }, [alertId, orgSlug, reloadKey]);

  useEffect(() => () => {
    if (evaluationRefresh.current !== undefined) window.clearTimeout(evaluationRefresh.current);
  }, []);

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
        `/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alertId)}`,
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
        `/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alertId)}/evaluate`,
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
        evaluationRefresh.current = window.setTimeout(() => setReloadKey((value) => value + 1), 1_200);
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

  if (!data && (loading || refreshing)) return <AlertDetailSkeleton orgSlug={orgSlug} />;

  if (!data) {
    return (
      <ObservabilityPage>
        <Link
          to="/$orgSlug/observability/alerts"
          params={{ orgSlug }}
          search={listSearch}
          className="inline-flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.7} />
          All alerts
        </Link>
        <div className="rounded-xl border border-white/[0.07] px-6 py-16 text-center">
          <p className="text-sm font-medium text-rose-400">
            {error || "Alert details are unavailable."}
          </p>
          <Button
            type="button"
            onClick={() => {
              setLoading(true);
              setReloadKey((value) => value + 1);
            }}
            size="sm" className="mt-5"
          >
            Try again
          </Button>
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
      <header className="space-y-4">
        <Link
          to="/$orgSlug/observability/alerts"
          params={{ orgSlug }}
          search={listSearch}
          className="inline-flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.7} />
          All alerts
        </Link>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <AlertIcon alert={alert} size={36} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-[20px] font-normal tracking-[-0.035em] text-white">
                  {alert.name}
                </h1>
                <AlertStatePill alert={alert} />
              </div>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-zinc-400">
                {alert.description || conditionLabel(alert)}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">{alert.service} <span aria-hidden="true">·</span> {alert.environment || "All environments"}</p>
              {effectiveState === "muted" && alert.underlyingState && (
                <p className="mt-2 text-xs text-zinc-400">
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

      <nav aria-label="Alert details" className="overflow-x-auto border-b border-white/[0.08]" data-alert-detail-tabs>
        <LayoutGroup id={tabsId}><div className="flex min-w-max items-center gap-6">
          {detailTabs.map((tab) => (
            <Link
              key={tab.label}
              to={tab.to}
              params={{ orgSlug, alertId }}
              search={listSearch}
              activeOptions={{ exact: true }}
              className="relative px-0.5 pb-3 pt-1 text-[13px] text-zinc-400 transition-colors hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white motion-reduce:transition-none"
              activeProps={{ className: "!text-zinc-100", "aria-current": "page" }}
            >
              {({ isActive }) => <>{tab.label}{isActive && <motion.span layoutId="alert-detail-selection" aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-zinc-100" transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }} />}</>}
            </Link>
          ))}
        </div></LayoutGroup>
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
          <span role={actionError || error ? "alert" : "status"}>
            {actionError ||
              actionNotice ||
              `${error} Showing the last successful result${
                lastSuccessAt ? ` from ${formatClockTime(lastSuccessAt)}.` : "."
              }`}
          </span>
          {error && (
            <Button variant="ghost" size="sm"
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="shrink-0"
            >
              Retry
            </Button>
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

      {isEditingDetails && <AlertDetailsEditModal
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
      />}

      {isDeleting && <DeleteAlertModal
        isOpen={isDeleting}
        alert={alert}
        orgSlug={orgSlug}
        onClose={() => setIsDeleting(false)}
        onDeleted={() =>
          void navigate({
            to: "/$orgSlug/observability/alerts",
            params: { orgSlug },
            search: listSearch,
          })
        }
      />}
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

  return <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent title="Edit alert details" description="Update the name and description without changing the condition." className="outray-arc outray-arc-dialog" closeDisabled={saving} onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }} onInteractOutside={(event) => { if (saving) event.preventDefault(); }}>
    <form onSubmit={(event) => void save(event)} className="space-y-4" aria-busy={saving}>
      <label className="block text-xs text-zinc-400">Name
        <WorkspaceInput value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required disabled={saving} className="mt-2" />
      </label>
      <label className="block text-xs text-zinc-400">Description
        <WorkspaceTextarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} disabled={saving} className="mt-2" />
      </label>
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!name.trim()} loading={saving}>{saving ? "Saving…" : "Save details"}</Button>
      </div>
    </form>
    </DialogContent>
  </Dialog>;
}

export function AlertOverviewTab() {
  const { data, refreshing, orgSlug, onEditDetails } = useAlertDetail();
  const listSearch = normalizeAlertsSearch(useSearch({ strict: false }));
  const { alert, evaluations, incidents, notifications } = data;
  const effectiveState = getEffectiveState(alert);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-zinc-200">At a glance</h2>
        <Button type="button" variant="secondary" size="sm" onClick={onEditDetails}>
          <HugeiconsIcon icon={PencilEdit02Icon} size={15} strokeWidth={1.7} />
          Edit details
        </Button>
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
          detail={alert.openIncidentId ? "Investigating this alert" : "No unresolved incident"}
          tone={alert.openIncidentId ? "rose" : "neutral"}
        />
      </section>

      <Panel
        title="Evaluation trend"
        description="Latest observed values against the configured threshold"
        action={
          <span className="text-xs text-zinc-500">
            {refreshing ? "Updating…" : `${evaluations.length} recent evaluations`}
          </span>
        }
      >
        <EvaluationChart alert={alert} evaluations={evaluations} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Latest incident" action={<Link to="/$orgSlug/observability/alerts/$alertId/incidents" params={{ orgSlug, alertId: alert.id }} search={listSearch} className="text-xs text-zinc-400 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-white">View history →</Link>}>
          {incidents[0] ? <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-4">
            <div className="space-y-2"><IncidentStatus state={incidents[0].status} /><p className="text-xs text-zinc-400">Started {formatDateTime(incidentStart(incidents[0]))}</p></div>
            <span className="text-xs text-zinc-400">{formatIncidentDuration(incidents[0])}</span>
          </div> : <EmptyPanel message="No incidents have been opened." compact />}
        </Panel>
        <Panel title="Latest notification" action={<Link to="/$orgSlug/observability/alerts/$alertId/notifications" params={{ orgSlug, alertId: alert.id }} search={listSearch} className="text-xs text-zinc-400 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-white">View deliveries →</Link>}>
          {notifications[0] ? <div className="space-y-2 px-4 py-4 sm:px-4"><p className="flex items-center justify-between gap-4 text-[13px] text-zinc-200"><span className="capitalize">{notifications[0].channel || "Email"}</span><DeliveryStatus state={notifications[0].status} /></p><p className="text-xs text-zinc-400">{formatDateTime(notifications[0].sentAt || notifications[0].createdAt)}</p></div> : <EmptyPanel message="No notification attempts yet." compact />}
        </Panel>
      </div>
    </div>
  );
}

export function AlertConditionTab() {
  const { data, onEditCondition } = useAlertDetail();
  const { alert } = data;

  return (
    <div className="space-y-4">
      <TabHeading
        title="Condition"
        description="The signal, scope, and evaluation rules for this alert."
      />
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#111112] px-4 py-4 text-[13px] leading-5 text-zinc-300 sm:px-4">
        <span>{conditionLabel(alert)}</span>
        <Button type="button" variant="secondary" size="sm" onClick={onEditCondition}>
          <HugeiconsIcon icon={PencilEdit02Icon} size={15} strokeWidth={1.7} />
          Edit condition
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Signal and scope">
          <div className="divide-y divide-white/[0.06] px-4 sm:px-5">
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
          <div className="divide-y divide-white/[0.06] px-4 sm:px-5">
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
    <div className="space-y-4">
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
        <div className="hidden grid-cols-[150px_110px_120px_100px_minmax(0,1fr)] gap-4 border-b border-white/[0.07] px-4 py-3 text-[11px] font-medium text-zinc-500 sm:px-5 lg:grid">
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
                className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[150px_110px_120px_100px_minmax(0,1fr)] lg:items-center lg:gap-4"
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
    <div className="space-y-4">
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
              <div key={incident.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-zinc-200"><IncidentStatus state={incident.status} /></p>
                  <p className="mt-1 text-xs text-zinc-500">Started {formatDateTime(incidentStart(incident))}</p>
                  {incident.resolvedAt && (
                    <p className="mt-1 text-xs text-zinc-500">Resolved {formatDateTime(incident.resolvedAt)}</p>
                  )}
                </div>
                <span className="text-xs text-zinc-400">{formatIncidentDuration(incident)}</span>
                <div className="sm:text-right">
                  <p className="font-mono text-[13px] text-zinc-300">
                    {formatAlertValue(incident.lastValue ?? incident.triggerValue, alert)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">Last observed value</p>
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
  const [emails, setEmails] = useState<string[]>(alert.notificationEmails?.length ? alert.notificationEmails : alert.notificationEmail ? [alert.notificationEmail] : []);
  const [settingsProvider, setSettingsProvider] = useState<"slack" | "discord" | null>(null);
  const [setupProviders, setSetupProviders] = useState<Array<"slack" | "discord">>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const integrationResult = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("integration");

  useEffect(() => {
    const key = `outray-alert-setup:${alert.id}`;
    const fromUrl = new URLSearchParams(window.location.search).get("setup")?.split(",") ?? [];
    let stored: unknown = [];
    try { stored = JSON.parse(window.sessionStorage.getItem(key) ?? "[]"); } catch { /* Ignore stale setup state. */ }
    const requested = [...fromUrl, ...(Array.isArray(stored) ? stored : [])].filter((provider): provider is "slack" | "discord" => provider === "slack" || provider === "discord");
    const pending = [...new Set(requested)];
    try { if (pending.length) window.sessionStorage.setItem(key, JSON.stringify(pending)); } catch { /* URL setup remains available when storage is restricted. */ }
    setSetupProviders(pending);
  }, [alert.id]);

  useEffect(() => {
    if (!setupProviders.length) return;
    if (setupProviders.every((provider) => provider === "slack" ? alert.notificationSlackConfigured : alert.notificationDiscordConfigured)) {
      try { window.sessionStorage.removeItem(`outray-alert-setup:${alert.id}`); } catch { /* Storage is optional. */ }
      setSetupProviders([]);
    }
  }, [alert.id, alert.notificationDiscordConfigured, alert.notificationSlackConfigured, setupProviders]);

  useEffect(() => {
    if (!editingEmail) setEmails(alert.notificationEmails?.length ? alert.notificationEmails : alert.notificationEmail ? [alert.notificationEmail] : []);
  }, [alert.notificationEmail, alert.notificationEmails, editingEmail]);

  const base = `/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alert.id)}/integrations`;
  const saveEmail = async () => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alert.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notificationEmails: emails }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save email notifications");
      setEditingEmail(false);
      setNotice("Email destination updated.");
      onReload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save email notifications");
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  };
  const disconnect = async (provider: "slack" | "discord") => {
    if (mutationLock.current) return;
    mutationLock.current = true;
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
      mutationLock.current = false;
      setSaving(false);
    }
  };
  const selectedTarget = settingsProvider === "slack"
    ? alert.notificationSlackTarget
    : alert.notificationDiscordTarget;

  return (
    <div className="space-y-4">
      <TabHeading
        title="Notifications"
        description="Where alert updates go and the outcome of each delivery attempt."
        count={notifications.length}
      />
      {(error || notice || integrationResult) && (
        <p role={error || integrationResult === "failed" || integrationResult === "invalid_state" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-xs ${error || integrationResult === "failed" || integrationResult === "invalid_state" ? "border-rose-400/20 text-rose-300" : "border-emerald-400/20 text-emerald-300"}`}>
          {error || notice || (integrationResult === "connected" ? "Destination connected. Alerts will be delivered to the selected channel." : integrationResult === "cancelled" ? "Connection cancelled." : "Could not connect the destination. Please try again.")}
        </p>
      )}
      {setupProviders.length > 0 && <div className="rounded-xl border border-white/[0.1] bg-white/[0.025] px-4 py-4">
        <p className="text-[13px] font-medium text-zinc-100">Finish connecting your notification methods</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">Authorize each provider and choose the channel that should receive this alert.</p>
        <div className="mt-3 flex flex-wrap gap-2">{setupProviders.map((provider) => {
          const connected = provider === "slack" ? alert.notificationSlackConfigured : alert.notificationDiscordConfigured;
          return connected
            ? <span key={provider} className="rounded-lg border border-emerald-400/20 px-3 py-2 text-xs text-emerald-300">{provider === "slack" ? "Slack" : "Discord"} connected</span>
            : <a key={provider} href={`/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alert.id)}/integrations/${provider}/start`} className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-xs font-medium text-black hover:bg-zinc-200">Connect {provider === "slack" ? "Slack" : "Discord"}</a>;
        })}</div>
      </div>}
      <Panel title="Notification methods" description="Choose where firing and recovery updates should go.">
        <div className="divide-y divide-white/[0.07]">
          <div className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-300">
              <HugeiconsIcon icon={Notification02Icon} size={19} strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-zinc-100">Email</p>
              <p className="mt-1 break-all text-xs leading-5 text-zinc-400">{alert.notificationEmails?.length ? alert.notificationEmails.join(", ") : alert.notificationEmail || "No recipients configured"}</p>
            </div>
            <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => { setEditingEmail((value) => !value); setError(null); }}>
              {editingEmail ? "Cancel" : alert.notificationEmails?.length || alert.notificationEmail ? "Edit" : "Add email"}
            </Button>
            {editingEmail && <div className="w-full space-y-3 pl-0 sm:pl-[60px]">
              <AlertEmailRecipients orgSlug={orgSlug} value={emails} onChange={setEmails} disabled={saving} />
              {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
              <Button type="button" size="sm" loading={saving} onClick={() => void saveEmail()}>Save recipients</Button>
            </div>}
          </div>
          {(["slack", "discord"] as const).map((provider) => {
            const connected = provider === "slack" ? alert.notificationSlackConfigured : alert.notificationDiscordConfigured;
            const target = provider === "slack" ? alert.notificationSlackTarget : alert.notificationDiscordTarget;
            const available = data.integrationAvailability?.[provider];
            const title = provider === "slack" ? "Slack" : "Discord";
            return <div key={provider} className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.035]">
                <img src={`/logos/${provider}.svg`} alt="" className="size-5 object-contain" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-zinc-100">{title}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {connected
                    ? provider === "slack"
                      ? [target?.workspaceName, target?.channelName].filter(Boolean).join(" · ") || "Connected channel"
                      : target?.channelId ? `Channel ${target.channelId}` : "Connected channel"
                    : available ? "Connect and select a channel" : "OAuth app not configured"}
                </p>
              </div>
              {connected ? <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => { setSettingsProvider(provider); setError(null); }} aria-label={`${title} settings`}>
                <HugeiconsIcon icon={Settings02Icon} size={17} strokeWidth={1.7} />
                Settings
              </Button> : available ? <a href={`${base}/${provider}/start`} className="inline-flex h-9 items-center rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-xs text-zinc-200 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-white">Connect</a> : null}
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
              <div key={notification.id} className="flex items-start gap-4 px-4 py-4 sm:px-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] text-zinc-500">
                  <HugeiconsIcon icon={Notification02Icon} size={15} strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-[13px] text-zinc-300">
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
                <DeliveryStatus state={notification.status} />
              </div>
            ))
          )}
        </div>
      </Panel>
      <Dialog open={settingsProvider !== null} onOpenChange={(open) => { if (!open && !saving) setSettingsProvider(null); }}>
        <DialogContent title={`${settingsProvider === "slack" ? "Slack" : "Discord"} settings`} description="Removing this connection stops its notifications for this alert. Other destinations are unchanged." className="outray-arc outray-arc-dialog" closeDisabled={saving} onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }} onInteractOutside={(event) => { if (saving) event.preventDefault(); }}>
          <dl className="space-y-3 rounded-lg border border-white/[0.08] p-4 text-[13px]">
            {settingsProvider === "slack" && <div><dt className="text-zinc-500">Workspace</dt><dd className="mt-1 text-zinc-200">{alert.notificationSlackTarget?.workspaceName || "Connected workspace"}</dd></div>}
            <div><dt className="text-zinc-500">Channel</dt><dd className="mt-1 text-zinc-200">{settingsProvider === "slack" ? selectedTarget?.channelName || selectedTarget?.channelId || "Selected channel" : selectedTarget?.channelId || "Selected channel"}</dd></div>
          </dl>
          {error && <p role="alert" className="mt-4 text-xs text-rose-400">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {settingsProvider && <a href={saving ? undefined : `${base}/${settingsProvider}/start`} aria-disabled={saving} className="inline-flex h-9 items-center rounded-lg border border-white/[0.1] px-3 text-xs text-zinc-200 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-white">Change channel</a>}
            {settingsProvider && <Button type="button" variant="danger" size="sm" loading={saving} onClick={() => void disconnect(settingsProvider)}>Remove from alert</Button>}
          </div>
        </DialogContent>
      </Dialog>
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
        <h2 className="text-[13px] font-medium text-zinc-100">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-400">{description}</p>
      </div>
      {count !== undefined && (
        <span className="text-xs text-zinc-400">
          {count} recent
        </span>
      )}
    </div>
  );
}

function ObservabilityPage({ children }: { children: ReactNode }) {
  return <div className="outray-arc outray-arc-list mx-auto max-w-[1440px] space-y-5">{children}</div>;
}

function Panel({ title, description, action, children }: { title?: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
    {(title || action) && <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5"><div>{title && <h2 className="text-[13px] font-medium text-zinc-200">{title}</h2>}{description && <p className="mt-1 text-[11px] leading-5 text-zinc-400">{description}</p>}</div>{action}</header>}
    {children}
  </section>;
}

function DeliveryStatus({ state }: { state: string }) {
  const tone = state === "sent" || state === "delivered" ? "text-emerald-400 bg-emerald-400/[0.07]" : state === "failed" ? "text-rose-400 bg-rose-400/[0.07]" : state === "suppressed" ? "text-zinc-400 bg-white/[0.04]" : "text-amber-400 bg-amber-400/[0.07]";
  return <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] capitalize ${tone}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{state.replaceAll("_", " ")}</span>;
}

function IncidentStatus({ state }: { state: string }) {
  return <span className={`inline-flex w-fit items-center gap-2 rounded-full px-2 py-1 text-[11px] ${state === "open" ? "bg-rose-400/[0.07] text-rose-400" : "bg-emerald-400/[0.07] text-emerald-400"}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{state === "open" ? "Open incident" : "Resolved incident"}</span>;
}

function formatIncidentDuration(incident: AlertIncident) {
  const start = incidentStart(incident);
  if (!start) return "Duration unavailable";
  const from = new Date(start).getTime();
  const end = incident.resolvedAt ? new Date(incident.resolvedAt).getTime() : Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(end)) return "Duration unavailable";
  const minutes = Math.max(0, Math.floor((end - from) / 60_000));
  const duration = minutes < 1 ? "Less than a minute" : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  return incident.status === "open" ? `${duration} ongoing` : duration;
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
    <div className="h-60 px-3 pb-3 pt-4 sm:px-5" role="img" aria-label="Alert evaluation values and threshold">
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 320, height: 240 }}
      >
        <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="alert-value-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a1a1aa" stopOpacity={0.14} />
              <stop offset="100%" stopColor="#a1a1aa" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="rgba(255,255,255,0.045)"
          />
          <XAxis
            dataKey="timestamp"
            axisLine={false}
            tickLine={false}
            minTickGap={36}
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickFormatter={(value) => formatShortTime(String(value))}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={52}
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickFormatter={(value) => formatAlertValue(Number(value), alert)}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
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
            stroke="#a1a1aa"
            strokeWidth={1.8}
            fill="url(#alert-value-fill)"
            activeDot={{ r: 3, fill: "#f4f4f5", stroke: "#111112" }}
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
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      size="sm"
      variant={tone === "danger" ? "danger" : "secondary"}
    >
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.7} />
      {label}
    </Button>
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
    <div className="min-w-0 bg-[#111112] px-4 py-4 sm:px-5">
      <p className="text-xs text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-2 truncate text-[22px] font-normal tabular-nums tracking-[-0.035em] ${tone === "rose" ? "text-rose-400" : "text-zinc-200"}`}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-5 py-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="max-w-[65%] break-words text-right text-xs text-zinc-400">
        {value}
      </span>
    </div>
  );
}

function EvaluationState({ state }: { state: string }) {
  const normalized = state === "noData" ? "no_data" : state;
  const supported = ["firing", "pending", "healthy", "no_data", "error", "muted", "paused"].includes(normalized);
  return <AlertStateBadge state={supported ? normalized as AlertState : "no_data"} />;
}

function EmptyPanel({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div className={`px-5 text-center text-xs leading-5 text-zinc-400 ${compact ? "py-6" : "py-12"}`}>
      {message}
    </div>
  );
}

function AlertDetailSkeleton({ orgSlug }: { orgSlug: string }) {
  const listSearch = normalizeAlertsSearch(useSearch({ strict: false }));
  return (
    <ObservabilityPage>
      <Link
        to="/$orgSlug/observability/alerts"
        params={{ orgSlug }}
        search={listSearch}
        className="inline-flex items-center gap-2 text-xs text-zinc-400"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.7} />
        All alerts
      </Link>
      <div className="animate-pulse space-y-5 motion-reduce:animate-none" aria-busy="true" aria-label="Loading alert details">
        <header className="border-b border-white/[0.07] pb-7">
          <div className="flex min-w-0 items-center gap-4">
            <span className="size-11 rounded-lg bg-white/[0.055]" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-6 w-56 max-w-full rounded bg-white/[0.07]" />
              <div className="h-3 w-80 max-w-full rounded bg-white/[0.04]" />
            </div>
          </div>
        </header>
        <div className="flex gap-7 overflow-hidden border-b border-white/[0.07] pb-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-4 w-20 rounded bg-white/[0.04]" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.06] xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-3 bg-[#111112] p-4"><div className="h-3 w-20 rounded bg-white/[0.07]" /><div className="h-6 w-24 rounded bg-white/[0.07]" /><div className="h-3 w-32 rounded bg-white/[0.04]" /></div>)}</div>
        <div className="h-60 rounded-xl border border-white/[0.07] bg-white/[0.015]" />
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
        `/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alert.id)}`,
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !deleting) onClose(); }}>
      <DialogContent title="Delete alert?" description="This cannot be undone." className="outray-arc outray-arc-dialog" closeDisabled={deleting} onEscapeKeyDown={(event) => { if (deleting) event.preventDefault(); }} onInteractOutside={(event) => { if (deleting) event.preventDefault(); }}>
        <div className="space-y-5" aria-busy={deleting}>
          <div className="flex items-start gap-3 text-[13px] leading-6 text-zinc-400">
            <HugeiconsIcon icon={Alert02Icon} size={18} className="mt-1 shrink-0 text-rose-400" />
            <p>Delete <span className="text-zinc-200">{alert.name}</span> and stop all future evaluations. Its incident history will no longer be available from this page.</p>
          </div>
          {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={deleting}>Cancel</Button>
            <Button type="button" variant="danger" size="sm" onClick={() => void remove()} loading={deleting}>{deleting ? "Deleting…" : "Delete alert"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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


function formatRelativeFuture(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "evaluation unknown";
  const seconds = Math.max(0, Math.ceil((timestamp - Date.now()) / 1_000));
  if (seconds < 60) return `in ${seconds}s`;
  return `in ${Math.ceil(seconds / 60)}m`;
}
