import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowLeft01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowLeft01Icon";
import ArrowRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowRight01Icon";
import CheckmarkCircle02Icon from "@hugeicons-pro/core-stroke-rounded/CheckmarkCircle02Icon";
import { Button } from "../arc/button/button";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import { Select } from "../arc/select/select";
import { WorkspaceInput, WorkspaceTextarea } from "../ui/workspace-input";
import { AlertEmailRecipients } from "./alert-email-recipients";
import { AlertSelectionControl } from "./alert-selection-control";
import {
  signalOptions,
  conditionLabel,
  formatWindow,
  type AlertRecord,
  type AlertSignal,
  type AlertOperator,
} from "./alerts-data";
import "../outray-arc-theme.css";
import styles from "./alert-form.module.css";

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

const alertFormSteps = [
  {
    label: "Signal & scope",
    shortLabel: "Signal",
    title: "What should OutRay watch?",
    description:
      "Name the alert, then choose the telemetry and service it covers.",
  },
  {
    label: "Condition",
    shortLabel: "Condition",
    title: "When should it fire?",
    description: "Set the threshold, evaluation window, and recovery behavior.",
  },
  {
    label: "Review & notify",
    shortLabel: "Review",
    title: "Ready to create this alert?",
    description:
      "Choose notification methods and check the rule before saving.",
  },
] as const;

interface AlertFormProps {
  isOpen: boolean;
  onClose: () => void;
  orgSlug: string;
  services: string[];
  initialAlert?: AlertRecord | null;
  integrationAvailability?: { slack: boolean; discord: boolean };
  onSaved: (
    alert: AlertRecord,
    setupProviders: Array<"slack" | "discord">,
  ) => void;
  mode?: "create" | "condition";
}

export function AlertFormModal(props: AlertFormProps) {
  return (
    <AlertForm
      key={`${props.orgSlug}:${props.initialAlert?.id ?? "new"}:${props.mode ?? "create"}`}
      {...props}
    />
  );
}

function AlertForm({
  isOpen,
  onClose,
  orgSlug,
  services,
  initialAlert,
  integrationAvailability,
  onSaved,
  mode = "create",
}: AlertFormProps) {
  const conditionMode = mode === "condition";
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
  const [notificationEmails, setNotificationEmails] = useState<string[]>([]);
  const [setupProviders, setSetupProviders] = useState<
    Array<"slack" | "discord">
  >([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceOption[]>([]);
  const [logServices, setLogServices] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<MetricOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const loadedAlertRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      loadedAlertRef.current = null;
      return;
    }
    const alertId = initialAlert?.id ?? "new";
    if (loadedAlertRef.current === alertId) return;
    loadedAlertRef.current = alertId;
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
    setNotificationEmails(
      alert?.notificationEmails?.length
        ? alert.notificationEmails
        : alert?.notificationEmail
          ? [alert.notificationEmail]
          : [],
    );
    setSetupProviders([]);
    setStep(0);
    setError(null);
  }, [initialAlert, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (contentRef.current) contentRef.current.scrollTop = 0;
    if (step > 0) stepHeadingRef.current?.focus();
  }, [isOpen, step]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError(null);
    void Promise.allSettled([
      fetch(
        `/api/${encodeURIComponent(orgSlug)}/observability/services?range=30d`,
        {
          signal: controller.signal,
        },
      ).then(async (response) => {
        if (!response.ok) throw new Error("Service catalog unavailable");
        const payload = (await response.json()) as {
          services?: Array<{ name: string; environment?: string }>;
        };
        if (controller.signal.aborted) return;
        setServiceCatalog(
          (payload.services || []).map((item) => ({
            name: item.name,
            environment: item.environment || "",
          })),
        );
      }),
      fetch(
        `/api/${encodeURIComponent(orgSlug)}/observability/logs?range=30d&limit=1`,
        {
          signal: controller.signal,
        },
      ).then(async (response) => {
        if (!response.ok) throw new Error("Log catalog unavailable");
        const payload = (await response.json()) as { services?: string[] };
        if (controller.signal.aborted) return;
        setLogServices(payload.services || []);
      }),
      fetch(
        `/api/${encodeURIComponent(orgSlug)}/observability/metrics?range=30d`,
        {
          signal: controller.signal,
        },
      ).then(async (response) => {
        if (!response.ok) throw new Error("Metric catalog unavailable");
        const payload = (await response.json()) as { metrics?: MetricOption[] };
        if (controller.signal.aborted) return;
        setMetrics(
          (payload.metrics || []).filter(
            (metric) => metric.type.toLowerCase() === "gauge",
          ),
        );
      }),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      if (results.some((result) => result.status === "rejected"))
        setOptionsError(
          "Some telemetry choices could not be loaded. Existing selections are still available.",
        );
      setOptionsLoading(false);
    });
    return () => controller.abort();
  }, [isOpen, orgSlug, optionsAttempt]);

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
        new Set([
          ...serviceCatalog
            .filter((item) => item.name === service)
            .map((item) => item.environment)
            .filter(Boolean),
          ...(initialAlert?.service === service && initialAlert.environment
            ? [initialAlert.environment]
            : []),
        ]),
      ).sort(),
    [service, serviceCatalog, initialAlert?.service, initialAlert?.environment],
  );
  const availableMetrics = useMemo(() => {
    const serviceMetrics = metrics.filter(
      (metric) => !metric.services?.length || metric.services.includes(service),
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
    // Initialization and this effect share a commit; do not overwrite the saved scope.
    if (!service && initialAlert?.service) return;
    if (!service || !availableServices.includes(service)) {
      setService(availableServices[0]);
      setEnvironment("all");
      setMetricKey("");
    }
  }, [availableServices, initialAlert?.service, isOpen, service]);

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

  const validateStep = (stepIndex: number): string | null => {
    if (stepIndex === 0) {
      if (!conditionMode && !name.trim()) return "Give this alert a name.";
      if (!conditionMode && name.trim().length > 120)
        return "Keep the alert name under 120 characters.";
      if (!conditionMode && description.trim().length > 1_000)
        return "Keep the description under 1,000 characters.";
      if (!service.trim()) return "Choose a service for this alert.";
      if (signal === "metric_value" && !selectedMetric)
        return "Choose a gauge metric to evaluate.";
      if (signal === "log_count" && logQuery.trim().length > 500)
        return "Keep the log search under 500 characters.";
    }

    if (stepIndex === 1) {
      if (![1, 5, 10, 15, 30, 60].includes(Number(windowMinutes)))
        return "Choose a supported evaluation window.";
      if (![60, 300, 900].includes(Number(evaluationIntervalSeconds)))
        return "Choose a supported evaluation interval.";
      const numericThreshold = Number(threshold);
      if (
        signal !== "no_telemetry" &&
        (!threshold.trim() || !Number.isFinite(numericThreshold))
      ) {
        return "Enter a valid threshold.";
      }
      if (
        signal === "request_error_rate" &&
        (numericThreshold < 0 || numericThreshold > 100)
      ) {
        return "Error rate must be between 0% and 100%.";
      }
      if (
        signal !== "no_telemetry" &&
        signal !== "metric_value" &&
        numericThreshold < 0
      ) {
        return "The threshold cannot be negative.";
      }
      if (signal === "no_telemetry" && Number(windowMinutes) < 5)
        return "No-telemetry alerts need a window of at least 5 minutes.";
      if (!integerInRange(consecutiveFailures, 1, 10))
        return "Failures to fire must be between 1 and 10.";
      if (!integerInRange(consecutiveRecoveries, 1, 10))
        return "Recoveries to resolve must be between 1 and 10.";
      if (!integerInRange(minimumSamples, 1, 1_000_000))
        return "Minimum samples must be between 1 and 1,000,000.";
    }

    if (stepIndex === 2 && notificationEmails.length > 100)
      return "Select no more than 100 email recipients.";
    return null;
  };

  const showError = (message: string) => {
    setError(message);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    if (!conditionMode && step < alertFormSteps.length - 1) {
      const stepError = validateStep(step);
      if (stepError) {
        showError(stepError);
        return;
      }
      setError(null);
      setStep(step + 1);
      return;
    }

    for (
      let index = 0;
      index < (conditionMode ? 2 : alertFormSteps.length);
      index += 1
    ) {
      const stepError = validateStep(index);
      if (stepError) {
        if (!conditionMode) setStep(index);
        showError(stepError);
        return;
      }
    }

    const normalizedName = name.trim();
    const numericThreshold = Number(threshold);

    const payload = {
      ...(!conditionMode
        ? { name: normalizedName, description: description.trim() || null }
        : {}),
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
      metricAggregation: signal === "metric_value" ? metricAggregation : null,
      logLevel: signal === "log_count" ? logLevel : null,
      logQuery: signal === "log_count" ? logQuery.trim() || null : null,
      operator,
      threshold: signal === "no_telemetry" ? 0 : numericThreshold,
      windowMinutes: positiveInteger(windowMinutes, 5),
      evaluationIntervalSeconds: positiveInteger(evaluationIntervalSeconds, 60),
      consecutiveFailures: positiveInteger(consecutiveFailures, 2),
      consecutiveRecoveries: positiveInteger(consecutiveRecoveries, 2),
      minimumSamples: positiveInteger(minimumSamples, 1),
      noDataState,
      ...(!conditionMode
        ? { notificationEmails, enabled: initialAlert?.enabled ?? true }
        : {}),
    };

    savingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const endpoint = initialAlert
        ? `/api/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(initialAlert.id)}`
        : `/api/${encodeURIComponent(orgSlug)}/observability/alerts`;
      const response = await fetch(endpoint, {
        method: initialAlert ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as {
        alert?: AlertRecord;
        error?: string;
        field?: string;
      } | null;
      if (!response.ok || !result?.alert) {
        if (result?.field && !conditionMode)
          setStep(alertFieldStep(result.field));
        throw new Error(result?.error || "Could not save this alert");
      }
      onSaved(result.alert, setupProviders);
    } catch (requestError) {
      showError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save this alert.",
      );
    } finally {
      savingRef.current = false;
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
    notificationEmail: notificationEmails[0] ?? null,
    notificationEmails,
    notificationSlackConfigured: Boolean(
      initialAlert?.notificationSlackConfigured,
    ),
    notificationDiscordConfigured: Boolean(
      initialAlert?.notificationDiscordConfigured,
    ),
    notificationSlackTarget: initialAlert?.notificationSlackTarget ?? null,
    notificationDiscordTarget: initialAlert?.notificationDiscordTarget ?? null,
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
  const activeStep = alertFormSteps[step] ?? alertFormSteps[0];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !savingRef.current) onClose();
      }}
    >
      <DialogContent
        title={
          conditionMode
            ? "Edit condition"
            : initialAlert
              ? "Edit alert"
              : "Create alert"
        }
        description={
          conditionMode
            ? "Update the signal, scope, and evaluation behavior."
            : "Choose a signal, define a condition, then connect your team."
        }
        closeDisabled={submitting}
        className={`workspace-ui outray-arc ${styles.dialog}`}
        onOpenAutoFocus={() => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (savingRef.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (savingRef.current) event.preventDefault();
        }}
      >
        <form onSubmit={submit} noValidate className={styles.form}>
          {!conditionMode && (
            <ol
              aria-label="Alert setup progress"
              className="grid shrink-0 grid-cols-3 border-b border-white/[0.07]"
            >
              {alertFormSteps.map((item, index) => (
                <li
                  key={item.label}
                  aria-current={step === index ? "step" : undefined}
                  className={`flex min-w-0 items-center gap-2 px-3 py-3 sm:px-5 ${step === index ? "bg-white/[0.035]" : ""}`}
                >
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium ${
                      index < step
                        ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300"
                        : index === step
                          ? "border-zinc-200 bg-zinc-200 text-zinc-950"
                          : "border-white/[0.12] text-zinc-400"
                    }`}
                  >
                    {index < step ? (
                      <HugeiconsIcon
                        icon={CheckmarkCircle02Icon}
                        size={14}
                        strokeWidth={2}
                      />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={`truncate text-[11px] font-medium sm:text-xs ${
                      step === index ? "text-zinc-100" : "text-zinc-400"
                    }`}
                  >
                    <span className="sm:hidden">{item.shortLabel}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}

          <div
            ref={contentRef}
            className={`${styles.content} space-y-5 px-5 py-5 sm:px-6`}
          >
            <fieldset disabled={submitting} className="min-w-0 space-y-5">
              <div>
                <h3
                  ref={stepHeadingRef}
                  tabIndex={-1}
                  className="text-[14px] font-medium tracking-[-0.015em] text-zinc-100 outline-none"
                >
                  {conditionMode
                    ? "Condition"
                    : step === 2 && initialAlert
                      ? "Ready to save your changes?"
                      : activeStep.title}
                </h3>
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  {conditionMode
                    ? "Saving resets the evaluation state and resolves any open alert incident."
                    : activeStep.description}
                </p>
              </div>
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-400/15 bg-rose-400/[0.035] px-3 py-2.5 text-xs text-rose-300"
                >
                  {error}
                </div>
              )}
              {optionsError && (step === 0 || conditionMode) && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-400/15 px-3 py-2.5 text-xs text-amber-200/90"
                >
                  <span className="min-w-0 flex-1">{optionsError}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={optionsLoading}
                    onClick={() => setOptionsAttempt((current) => current + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}

              {(step === 0 || conditionMode) && (
                <>
                  {!conditionMode && (
                    <FormSection title="Alert details">
                      <label className="block">
                        <FieldLabel>Name</FieldLabel>
                        <WorkspaceInput
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="e.g. Checkout 5xx rate"
                          maxLength={120}
                          className="mt-2"
                          autoFocus
                        />
                      </label>
                      <label className="block">
                        <FieldLabel>Description</FieldLabel>
                        <WorkspaceTextarea
                          value={description}
                          onChange={(event) =>
                            setDescription(event.target.value)
                          }
                          placeholder="What this alert protects and who should respond"
                          rows={2}
                          maxLength={1000}
                          className="mt-2"
                          style={{ minHeight: 80, resize: "none" }}
                        />
                      </label>
                    </FormSection>
                  )}

                  <FormSection title="Signal and scope">
                    <div>
                      <Select
                        disabled={submitting}
                        value={signal}
                        onValueChange={selectSignal}
                        label="Signal"

                        options={signalOptions}
                      />
                      <p className="mt-1.5 text-[11px] leading-5 text-zinc-400">
                        {
                          signalOptions.find(
                            (option) => option.value === signal,
                          )?.description
                        }
                      </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Select
                          value={service}
                          onValueChange={(value) => {
                            setService(value);
                            setEnvironment("all");
                            setMetricKey("");
                          }}
                          label="Service"
                          disabled={
                            submitting ||
                            (optionsLoading && !availableServices.length)
                          }
                          options={availableServices.map((item) => ({
                            value: item,
                            label: item,
                          }))}
                          placeholder={
                            optionsLoading
                              ? "Loading services…"
                              : "Choose service"
                          }
                        />
                      </div>
                      <div>
                        <Select
                          disabled={submitting}
                          value={environment}
                          onValueChange={setEnvironment}
                          label="Environment"
                          options={[
                            { value: "all", label: "All environments" },
                            ...environments.map((item) => ({
                              value: item,
                              label: item,
                            })),
                          ]}
                        />
                      </div>
                    </div>

                    {signal === "metric_value" && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Select
                            value={metricKey}
                            onValueChange={setMetricKey}
                            label="Gauge metric"
                            disabled={
                              submitting ||
                              optionsLoading ||
                              !availableMetrics.length
                            }
                            placeholder={
                              optionsLoading
                                ? "Loading metrics…"
                                : "No gauges reported"
                            }
                            options={availableMetrics.map((metric) => ({
                              value: metric.key,
                              label: metric.name,
                              description: [metric.type, metric.unit]
                                .filter(Boolean)
                                .join(" · "),
                            }))}
                          />
                        </div>
                        <div>
                          <Select
                            disabled={submitting}
                            value={metricAggregation}
                            onValueChange={setMetricAggregation}
                            label="Metric aggregation"
                            options={[
                              { value: "latest", label: "Latest value" },
                              { value: "avg", label: "Average" },
                              { value: "max", label: "Maximum" },
                              { value: "min", label: "Minimum" },
                            ]}
                          />
                        </div>
                      </div>
                    )}

                    {signal === "log_count" && (
                      <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                        <div>
                          <Select
                            disabled={submitting}
                            value={logLevel}
                            onValueChange={setLogLevel}
                            label="Log level"
                            options={[
                              { value: "all", label: "All levels" },
                              { value: "debug", label: "Debug" },
                              { value: "info", label: "Info" },
                              { value: "warn", label: "Warning" },
                              { value: "error", label: "Error" },
                            ]}
                          />
                        </div>
                        <label>
                          <FieldLabel>Contains</FieldLabel>
                          <WorkspaceInput
                            value={logQuery}
                            onChange={(event) =>
                              setLogQuery(event.target.value)
                            }
                            placeholder="Optional message search"
                            className="mt-2"
                          />
                        </label>
                      </div>
                    )}
                  </FormSection>
                </>
              )}

              {(step === 1 || conditionMode) && (
                <FormSection title="Condition">
                  {signal === "no_telemetry" ? (
                    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs leading-5 text-zinc-500">
                      Fire when the selected service sends no telemetry during
                      the configured window.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                      <div>
                        <Select
                          disabled={submitting}
                          value={operator}
                          onValueChange={(value) =>
                            setOperator(value as AlertOperator)
                          }
                          label="Operator"
                          options={[
                            { value: "gt", label: "Greater than" },
                            { value: "gte", label: "Greater than or equal" },
                            { value: "lt", label: "Less than" },
                            { value: "lte", label: "Less than or equal" },
                          ]}
                        />
                      </div>
                      <label>
                        <FieldLabel>
                          {thresholdLabel(signal, selectedMetric)}
                        </FieldLabel>
                        <WorkspaceInput
                          type="number"
                          step="any"
                          value={threshold}
                          onChange={(event) => setThreshold(event.target.value)}
                          className="mt-2"
                        />
                      </label>
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <Select
                        disabled={submitting}
                        value={windowMinutes}
                        onValueChange={setWindowMinutes}
                        label="Evaluation window"
                        options={[
                          {
                            value: "1",
                            label: "1 minute",
                            disabled: signal === "no_telemetry",
                          },
                          { value: "5", label: "5 minutes" },
                          { value: "10", label: "10 minutes" },
                          { value: "15", label: "15 minutes" },
                          { value: "30", label: "30 minutes" },
                          { value: "60", label: "1 hour" },
                        ]}
                      />
                    </div>
                    <label>
                      <FieldLabel>Failures to fire</FieldLabel>
                      <WorkspaceInput
                        type="number"
                        min="1"
                        max="10"
                        value={consecutiveFailures}
                        onChange={(event) =>
                          setConsecutiveFailures(event.target.value)
                        }
                        className="mt-2"
                      />
                    </label>
                    <label>
                      <FieldLabel>Recoveries to resolve</FieldLabel>
                      <WorkspaceInput
                        type="number"
                        min="1"
                        max="10"
                        value={consecutiveRecoveries}
                        onChange={(event) =>
                          setConsecutiveRecoveries(event.target.value)
                        }
                        className="mt-2"
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <Select
                        disabled={submitting}
                        value={evaluationIntervalSeconds}
                        onValueChange={setEvaluationIntervalSeconds}
                        label="Evaluation interval"
                        options={[
                          { value: "60", label: "1 minute" },
                          { value: "300", label: "5 minutes" },
                          { value: "900", label: "15 minutes" },
                        ]}
                      />
                    </div>
                    <label>
                      <FieldLabel>Minimum samples</FieldLabel>
                      <WorkspaceInput
                        type="number"
                        min="1"
                        value={minimumSamples}
                        onChange={(event) =>
                          setMinimumSamples(event.target.value)
                        }
                        className="mt-2"
                      />
                    </label>
                    <div>
                      <Select
                        disabled={submitting}
                        value={noDataState}
                        onValueChange={setNoDataState}
                        label="No data behavior"
                        options={[
                          { value: "no_data", label: "Show no data" },
                          { value: "healthy", label: "Treat as healthy" },
                          { value: "alerting", label: "Treat as firing" },
                        ]}
                      />
                    </div>
                  </div>
                </FormSection>
              )}

              {step === 2 && !conditionMode && (
                <>
                  <FormSection title="Notifications">
                    <AlertEmailRecipients
                      orgSlug={orgSlug}
                      value={notificationEmails}
                      onChange={setNotificationEmails}
                      disabled={submitting}
                    />
                    <div
                      className="mt-5 space-y-2"
                      role="group"
                      aria-label="Other notification methods"
                    >
                      {(["slack", "discord"] as const).map((provider) => {
                        const available =
                          integrationAvailability?.[provider] ?? false;
                        const selected = setupProviders.includes(provider);
                        const title =
                          provider === "slack" ? "Slack" : "Discord";
                        return (
                          <label
                            key={provider}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors motion-reduce:transition-none ${available ? "cursor-pointer border-white/[0.08] hover:bg-white/[0.035]" : "cursor-not-allowed border-white/[0.06] opacity-55"}`}
                          >
                            <AlertSelectionControl
                              checked={selected}
                              disabled={submitting || !available}
                              onChange={() =>
                                setSetupProviders((current) =>
                                  selected
                                    ? current.filter(
                                        (item) => item !== provider,
                                      )
                                    : [...current, provider],
                                )
                              }
                            />
                            <img
                              src={`/logos/${provider}.svg`}
                              alt=""
                              className="size-6 object-contain"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] text-zinc-200">
                                {title}
                              </span>
                              <span className="block text-[11px] text-zinc-400">
                                {available
                                  ? "Connect a channel after creating this alert"
                                  : "OAuth app not configured"}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {setupProviders.length > 0 && (
                      <p className="mt-3 text-xs leading-5 text-zinc-500">
                        After creation, you’ll be taken to Notifications to
                        authorize{" "}
                        {setupProviders
                          .map((provider) =>
                            provider === "slack" ? "Slack" : "Discord",
                          )
                          .join(" and ")}{" "}
                        and choose a channel.
                      </p>
                    )}
                  </FormSection>

                  <FormSection title="Review rule">
                    <dl className="divide-y divide-white/[0.07] text-xs">
                      <div className="flex justify-between gap-5 pb-3">
                        <dt className="text-zinc-500">Alert</dt>
                        <dd className="text-right font-medium text-zinc-200">
                          {name.trim()}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-5 py-3">
                        <dt className="text-zinc-500">Service</dt>
                        <dd className="text-right text-zinc-300">
                          {service}
                          {environment === "all"
                            ? " · All environments"
                            : ` · ${environment}`}
                        </dd>
                      </div>
                      <div className="py-3">
                        <dt className="text-zinc-500">Fires when</dt>
                        <dd className="mt-1.5 leading-6 text-zinc-300">
                          {conditionLabel(previewAlert)}
                        </dd>
                      </div>
                      <div className="py-3">
                        <dt className="text-zinc-500">Evaluation</dt>
                        <dd className="mt-1.5 leading-6 text-zinc-300">
                          Every{" "}
                          {formatWindow(Number(evaluationIntervalSeconds) / 60)}
                          {` · Fires after ${consecutiveFailures} failing ${consecutiveFailures === "1" ? "evaluation" : "evaluations"}`}
                          {` · Resolves after ${consecutiveRecoveries} recovering ${consecutiveRecoveries === "1" ? "evaluation" : "evaluations"}`}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-5 pt-3">
                        <dt className="text-zinc-500">Notifications</dt>
                        <dd className="text-right text-zinc-300">
                          {[
                            notificationEmails.length > 0 &&
                              `Email (${notificationEmails.length})`,
                            ...setupProviders.map(
                              (provider) =>
                                `${provider === "slack" ? "Slack" : "Discord"} (connect next)`,
                            ),
                          ]
                            .filter(Boolean)
                            .join(", ") || "None selected"}
                        </dd>
                      </div>
                    </dl>
                  </FormSection>
                </>
              )}
            </fieldset>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-white/[0.07] px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (conditionMode || step === 0) onClose();
                else {
                  setError(null);
                  setStep(step - 1);
                }
              }}
              disabled={submitting}
            >
              {step > 0 && !conditionMode && (
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  size={15}
                  strokeWidth={1.7}
                />
              )}
              {conditionMode || step === 0 ? "Cancel" : "Back"}
            </Button>
            <Button type="submit" size="sm" loading={submitting}>
              {conditionMode
                ? submitting
                  ? "Saving…"
                  : "Save condition"
                : step < alertFormSteps.length - 1
                  ? "Continue"
                  : submitting
                    ? initialAlert
                      ? "Saving…"
                      : "Creating…"
                    : initialAlert
                      ? "Save changes"
                      : "Create alert"}
              {step < alertFormSteps.length - 1 && !conditionMode && (
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={15}
                  strokeWidth={1.7}
                />
              )}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
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
    <section className="space-y-4 border-t border-white/[0.07] pt-4">
      <h4 className="text-[13px] font-medium text-zinc-200">{title}</h4>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-zinc-400">{children}</span>;
}

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

function integerInRange(value: string, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum;
}

function alertFieldStep(field: string) {
  if (
    [
      "operator",
      "threshold",
      "windowMinutes",
      "evaluationIntervalSeconds",
      "consecutiveFailures",
      "consecutiveRecoveries",
      "minimumSamples",
      "noDataState",
    ].includes(field)
  ) {
    return 1;
  }
  return field === "notificationEmail" || field === "notificationEmails"
    ? 2
    : 0;
}
