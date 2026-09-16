export const DEFAULT_OUTRAY_OTLP_ENDPOINT = "https://ingest.outray.dev";

export type OutrayResourceAttributes = Record<
  string,
  string | number | boolean
>;

export interface OutrayObservabilityOptions {
  /** OutRay machine token. Defaults to OUTRAY_API_KEY. */
  apiKey?: string;
  /** Stable service identity shown in OutRay. Defaults to OTEL_SERVICE_NAME. */
  serviceName?: string;
  serviceVersion?: string;
  serviceNamespace?: string;
  /** Deployment environment, such as development, staging, or production. */
  environment?: string;
  /** Base OTLP/HTTP endpoint. Defaults to https://ingest.outray.dev. */
  endpoint?: string;
  /** Additional non-secret resource attributes attached to every signal. */
  attributes?: OutrayResourceAttributes;
  /** Additional OTLP headers. Authorization is always controlled by apiKey. */
  headers?: Record<string, string>;
  /** Export interval for metrics. Defaults to 60 seconds. */
  metricExportIntervalMillis?: number;
  /** Disable all telemetry without changing application bootstrap code. */
  enabled?: boolean;
  /** Enable OpenTelemetry diagnostic output. Off by default. */
  diagnostics?: "none" | "error" | "warn" | "info" | "debug";
}

export interface ResolvedOutrayObservabilityOptions {
  enabled: boolean;
  apiKey: string;
  serviceName: string;
  serviceVersion?: string;
  serviceNamespace?: string;
  environment?: string;
  endpoint: string;
  attributes: OutrayResourceAttributes;
  headers: Record<string, string>;
  metricExportIntervalMillis: number;
  diagnostics: NonNullable<OutrayObservabilityOptions["diagnostics"]>;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return !["0", "false", "off", "no"].includes(value.trim().toLowerCase());
}

function normalizeEndpoint(value: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error("OutRay OTLP endpoint must be a valid URL.");
  }
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    throw new Error("OutRay OTLP endpoint must use http or https.");
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString().replace(/\/$/, "");
}

function exporterHeaders(
  headers: Record<string, string> | undefined,
  apiKey: string,
): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(headers ?? {}).filter(
        ([name]) => name.toLowerCase() !== "authorization",
      ),
    ),
    Authorization: `Bearer ${apiKey}`,
  };
}

export function signalEndpoint(
  endpoint: string,
  signal: "traces" | "logs" | "metrics",
): string {
  return `${endpoint}/v1/${signal}`;
}

export function resolveOutrayObservabilityOptions(
  options: OutrayObservabilityOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedOutrayObservabilityOptions {
  const enabled =
    options.enabled ??
    parseBoolean(env.OUTRAY_OBSERVABILITY_ENABLED, true);
  const serviceName = firstNonEmpty(options.serviceName, env.OTEL_SERVICE_NAME);
  const apiKey = firstNonEmpty(options.apiKey, env.OUTRAY_API_KEY);

  if (enabled && !serviceName) {
    throw new Error(
      "OutRay observability requires serviceName or OTEL_SERVICE_NAME.",
    );
  }
  if (enabled && !apiKey) {
    throw new Error(
      "OutRay observability requires apiKey or OUTRAY_API_KEY.",
    );
  }

  const metricExportIntervalMillis =
    options.metricExportIntervalMillis ?? 60_000;
  if (
    !Number.isFinite(metricExportIntervalMillis) ||
    metricExportIntervalMillis < 1_000
  ) {
    throw new Error("metricExportIntervalMillis must be at least 1000.");
  }

  const endpoint = normalizeEndpoint(
    firstNonEmpty(
      options.endpoint,
      env.OUTRAY_OTLP_ENDPOINT,
      env.OTEL_EXPORTER_OTLP_ENDPOINT,
      DEFAULT_OUTRAY_OTLP_ENDPOINT,
    )!,
  );

  return {
    enabled,
    apiKey: apiKey ?? "",
    serviceName: serviceName ?? "outray-disabled",
    serviceVersion: firstNonEmpty(
      options.serviceVersion,
      env.OTEL_SERVICE_VERSION,
    ),
    serviceNamespace: firstNonEmpty(
      options.serviceNamespace,
      env.OTEL_SERVICE_NAMESPACE,
    ),
    environment: firstNonEmpty(
      options.environment,
      env.OTEL_DEPLOYMENT_ENVIRONMENT,
      env.NODE_ENV,
    ),
    endpoint,
    attributes: { ...(options.attributes ?? {}) },
    headers: exporterHeaders(options.headers, apiKey ?? ""),
    metricExportIntervalMillis,
    diagnostics: options.diagnostics ?? "none",
  };
}
