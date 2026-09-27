import {
  DiagLogLevel,
  SpanKind,
  SpanStatusCode,
  diag,
  metrics,
  trace,
  type Attributes,
  type Span,
  type Meter,
  type Tracer,
} from "@opentelemetry/api";
import { logs, type Logger } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { NestInstrumentation } from "@opentelemetry/instrumentation-nestjs-core";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { RedisInstrumentation } from "@opentelemetry/instrumentation-redis";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  resolveOutrayObservabilityOptions,
  signalEndpoint,
  type OutrayObservabilityOptions,
  type ResolvedOutrayObservabilityOptions,
} from "./config";
import {
  captureConsoleLogs,
  createOutrayLogMethods,
  type OutrayLogMethods,
} from "./logging";
import packageMetadata from "../package.json" with { type: "json" };

const OUTRAY_OBSERVABILITY_VERSION = packageMetadata.version;

export {
  DEFAULT_OUTRAY_OTLP_ENDPOINT,
  resolveOutrayObservabilityOptions,
  signalEndpoint,
} from "./config";
export type {
  OutrayObservabilityOptions,
  ResolvedOutrayObservabilityOptions,
} from "./config";
export type {
  OutrayLogLevel,
  OutrayLogMethod,
  OutrayLogMethods,
} from "./logging";

export interface OutrayObservability extends OutrayLogMethods {
  readonly config: Readonly<ResolvedOutrayObservabilityOptions>;
  readonly tracer: Tracer;
  readonly meter: Meter;
  readonly logger: Logger;
  readonly started: boolean;
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface OutrayNodeHttpRequest {
  method?: string;
  url?: string;
  originalUrl?: string;
  path?: string;
  baseUrl?: string;
  route?: { path?: unknown };
}

export interface OutrayNodeHttpResponse {
  statusCode?: number;
  once(event: "finish" | "close", listener: () => void): unknown;
}

export interface OutrayNodeHttpMiddlewareOptions {
  /** Framework adapter reporting the request. Defaults to `node-http`. */
  framework?: string;
  routeResolver?: (request: OutrayNodeHttpRequest) => string | null | undefined;
  ignore?: (request: OutrayNodeHttpRequest) => boolean;
}

export interface OutrayHttpServerMetricOptions {
  /** Framework or adapter reporting the request, such as `hono`. */
  framework: string;
  /** Instrumentation scope name. */
  instrumentationName?: string;
  /** Instrumentation scope version. */
  instrumentationVersion?: string;
}

export interface OutrayHttpServerRequestMetricStart {
  method: string;
  route: string;
}

export interface OutrayHttpServerRequestMetricEnd {
  statusCode: number;
  errorType?: string;
  /** Final framework route template when it becomes known after dispatch. */
  route?: string;
}

export interface OutrayHttpServerRequestMetrics {
  start(
    request: OutrayHttpServerRequestMetricStart,
  ): (result: OutrayHttpServerRequestMetricEnd) => void;
}

export interface OutraySpanOptions {
  attributes?: Attributes;
}

export type OutrayNodeHttpMiddleware = (
  request: OutrayNodeHttpRequest,
  response: OutrayNodeHttpResponse,
  next: () => void,
) => void;

let activeInstance: OutrayObservability | undefined;

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTEGER_SEGMENT = /^\d+$/;
const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;
const ULID_SEGMENT = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

/**
 * Create the low-cardinality HTTP server instruments shared by OutRay's
 * framework adapters. Durations use seconds to follow OpenTelemetry's stable
 * HTTP metric conventions.
 */
export function createOutrayHttpServerMetrics(
  options: OutrayHttpServerMetricOptions,
): OutrayHttpServerRequestMetrics {
  const meter = getOutrayMeter(
    options.instrumentationName ?? "@outray/http-server",
    options.instrumentationVersion,
  );
  const requestCount = meter.createCounter("http.server.request.count", {
    description: "Number of HTTP requests completed by the server.",
    unit: "{request}",
  });
  const requestDuration = meter.createHistogram(
    "http.server.request.duration",
    {
      description: "Duration of HTTP requests handled by the server.",
      unit: "s",
    },
  );
  const activeRequests = meter.createUpDownCounter(
    "http.server.active_requests",
    {
      description: "Number of HTTP requests currently being handled.",
      unit: "{request}",
    },
  );

  return {
    start({ method, route }) {
      const startedAt = performance.now();
      const activeRequestAttributes: Attributes = {
        "http.request.method": method.toUpperCase(),
        "outray.framework": options.framework,
      };
      const requestAttributes: Attributes = {
        ...activeRequestAttributes,
        "http.route": route,
      };
      try {
        activeRequests.add(1, activeRequestAttributes);
      } catch {
        // Metrics must never interfere with an application request.
      }

      let completed = false;
      return ({ statusCode, errorType, route: finalRoute }) => {
        if (completed) return;
        completed = true;
        const resultAttributes: Attributes = {
          ...requestAttributes,
          ...(finalRoute ? { "http.route": finalRoute } : {}),
          "http.response.status_code": statusCode,
          ...(errorType ? { "error.type": errorType } : {}),
        };
        const durationSeconds =
          Math.max(0, performance.now() - startedAt) / 1000;
        try {
          activeRequests.add(-1, activeRequestAttributes);
          requestCount.add(1, resultAttributes);
          requestDuration.record(durationSeconds, resultAttributes);
        } catch {
          // Metrics must never interfere with an application response.
        }
      };
    },
  };
}

function nodeRequestPath(request: OutrayNodeHttpRequest): string {
  if (request.path?.startsWith("/")) return request.path;
  try {
    return new URL(
      request.originalUrl ?? request.url ?? "/",
      "http://outray.local",
    ).pathname;
  } catch {
    return "/";
  }
}

function normalizeNodeRoute(pathname: string): string {
  const normalized = pathname
    .split("/")
    .map((segment) =>
      UUID_SEGMENT.test(segment) ||
      INTEGER_SEGMENT.test(segment) ||
      LONG_HEX_SEGMENT.test(segment) ||
      ULID_SEGMENT.test(segment)
        ? ":id"
        : segment,
    )
    .join("/");
  return (normalized.startsWith("/") ? normalized : `/${normalized}`).slice(
    0,
    256,
  );
}

function matchedNodeRoute(
  request: OutrayNodeHttpRequest,
  fallback: string,
): string {
  const matched = request.route?.path;
  if (typeof matched !== "string") return fallback;
  return `${request.baseUrl ?? ""}${matched}`.replace(/\/{2,}/g, "/");
}

function configureNodeSpan(
  span: Span,
  request: OutrayNodeHttpRequest,
  route: string,
  framework: string,
): void {
  const method = (request.method ?? "GET").toUpperCase();
  span.updateName(`${method} ${route}`);
  span.setAttributes({
    "http.request.method": method,
    "http.route": route,
    "url.path": nodeRequestPath(request),
    "outray.framework": framework,
  });
}

/**
 * Create Connect/Express-compatible request instrumentation. It reuses an
 * existing OpenTelemetry HTTP span when one is present and creates a server
 * span otherwise, so framework adapters do not require a Node preloader.
 */
export function createOutrayNodeHttpMiddleware(
  options: OutrayNodeHttpMiddlewareOptions = {},
): OutrayNodeHttpMiddleware {
  const framework = options.framework ?? "node-http";
  const tracer = getOutrayTracer(
    "@outray/node-http-middleware",
    OUTRAY_OBSERVABILITY_VERSION,
  );
  const requestMetrics = createOutrayHttpServerMetrics({
    framework,
    instrumentationName: "@outray/node-http-middleware",
    instrumentationVersion: OUTRAY_OBSERVABILITY_VERSION,
  });

  return (request, response, next) => {
    try {
      if (options.ignore?.(request)) {
        next();
        return;
      }
    } catch {
      // A telemetry filter cannot block an application request.
    }

    const pathname = nodeRequestPath(request);
    let route: string | null | undefined;
    try {
      route = options.routeResolver?.(request);
    } catch {
      // Fall back to bounded identifier normalization.
    }
    route ||= normalizeNodeRoute(pathname);
    const finishMetrics = requestMetrics.start({
      method: request.method ?? "GET",
      route,
    });

    const run = (span: Span, ownsSpan: boolean) => {
      configureNodeSpan(span, request, route!, framework);
      let completed = false;
      const complete = (error?: unknown) => {
        if (completed) return;
        completed = true;
        const finalRoute = matchedNodeRoute(request, route!);
        configureNodeSpan(span, request, finalRoute, framework);
        const statusCode =
          error && (response.statusCode ?? 200) < 500
            ? 500
            : (response.statusCode ?? 200);
        if (statusCode !== undefined) {
          span.setAttribute("http.response.status_code", statusCode);
          if (statusCode >= 500) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }
        }
        finishMetrics({
          statusCode,
          route: finalRoute,
          ...(error
            ? { errorType: error instanceof Error ? error.name : "Error" }
            : {}),
        });
        if (ownsSpan) span.end();
      };
      response.once("finish", complete);
      response.once("close", complete);
      try {
        next();
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        if (error instanceof Error) span.recordException(error);
        complete(error);
        throw error;
      }
    };

    const activeSpan = trace.getActiveSpan();
    if (activeSpan?.isRecording()) {
      run(activeSpan, false);
      return;
    }

    tracer.startActiveSpan(
      `${(request.method ?? "GET").toUpperCase()} ${route}`,
      { kind: SpanKind.SERVER },
      (span) => run(span, true),
    );
  };
}

function configureDiagnostics(
  level: ResolvedOutrayObservabilityOptions["diagnostics"],
): void {
  if (level === "none") return;
  const levels: Record<Exclude<typeof level, "none">, DiagLogLevel> = {
    error: DiagLogLevel.ERROR,
    warn: DiagLogLevel.WARN,
    info: DiagLogLevel.INFO,
    debug: DiagLogLevel.DEBUG,
  };
  // Bind the original functions before console interception is installed. This
  // keeps OpenTelemetry's own diagnostics from being exported as user logs.
  diag.setLogger(
    {
      debug: console.debug.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console),
      verbose: console.debug.bind(console),
      warn: console.warn.bind(console),
    },
    levels[level],
  );
}

function resourceAttributes(
  options: ResolvedOutrayObservabilityOptions,
): Record<string, string | number | boolean> {
  return {
    ...options.attributes,
    "service.name": options.serviceName,
    ...(options.serviceVersion
      ? { "service.version": options.serviceVersion }
      : {}),
    ...(options.serviceNamespace
      ? { "service.namespace": options.serviceNamespace }
      : {}),
    ...(options.environment
      ? { "deployment.environment.name": options.environment }
      : {}),
    "telemetry.distro.name": "outray",
    "telemetry.distro.version": OUTRAY_OBSERVABILITY_VERSION,
  };
}

/**
 * Start OutRay's Node.js OpenTelemetry distribution.
 *
 * Call this before importing HTTP servers, frameworks, database clients, or
 * loggers so their modules can be instrumented. For ESM applications, prefer
 * `node --import @outray/observability/register`.
 */
export function startOutrayObservability(
  input: OutrayObservabilityOptions = {},
): OutrayObservability {
  if (activeInstance) return activeInstance;

  const config = resolveOutrayObservabilityOptions(input);
  configureDiagnostics(config.diagnostics);

  if (!config.enabled) {
    const logger = logs.getLogger(config.serviceName, config.serviceVersion);
    const logMethods = createOutrayLogMethods(logger);
    const disabled: OutrayObservability = {
      ...logMethods,
      config,
      tracer: trace.getTracer(config.serviceName, config.serviceVersion),
      meter: metrics.getMeter(config.serviceName, config.serviceVersion),
      logger,
      started: false,
      async forceFlush() {},
      async shutdown() {
        if (activeInstance === disabled) activeInstance = undefined;
      },
    };
    activeInstance = disabled;
    return disabled;
  }

  const traceProcessor = new BatchSpanProcessor(
    new OTLPTraceExporter({
      url: signalEndpoint(config.endpoint, "traces"),
      headers: config.headers,
    }),
  );
  const logProcessor = new BatchLogRecordProcessor({
    exporter: new OTLPLogExporter({
      url: signalEndpoint(config.endpoint, "logs"),
      headers: config.headers,
    }),
  });
  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: signalEndpoint(config.endpoint, "metrics"),
      headers: config.headers,
    }),
    exportIntervalMillis: config.metricExportIntervalMillis,
  });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes(resourceAttributes(config)),
    spanProcessors: [traceProcessor],
    logRecordProcessors: [logProcessor],
    metricReaders: [metricReader],
    instrumentations: [
      new HttpInstrumentation(),
      new UndiciInstrumentation(),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      new PgInstrumentation(),
      new IORedisInstrumentation(),
      new RedisInstrumentation(),
      new PinoInstrumentation(),
      new WinstonInstrumentation(),
    ],
  });
  sdk.start();

  const logger = logs.getLogger(config.serviceName, config.serviceVersion);
  const logMethods = createOutrayLogMethods(logger);
  const restoreConsole = config.captureConsole
    ? captureConsoleLogs(logger)
    : () => {};
  let consoleRestored = false;
  const restoreConsoleOnce = () => {
    if (consoleRestored) return;
    consoleRestored = true;
    restoreConsole();
  };
  let shutdownPromise: Promise<void> | undefined;
  const instance: OutrayObservability = {
    ...logMethods,
    config,
    tracer: trace.getTracer(config.serviceName, config.serviceVersion),
    meter: metrics.getMeter(config.serviceName, config.serviceVersion),
    logger,
    started: true,
    async forceFlush() {
      await Promise.all([
        traceProcessor.forceFlush(),
        logProcessor.forceFlush(),
        metricReader.forceFlush(),
      ]);
    },
    shutdown() {
      shutdownPromise ??= (async () => {
        restoreConsoleOnce();
        try {
          await sdk.shutdown();
        } finally {
          if (activeInstance === instance) activeInstance = undefined;
        }
      })();
      return shutdownPromise;
    },
  };
  activeInstance = instance;
  return instance;
}

export function getOutrayObservability(): OutrayObservability | undefined {
  return activeInstance;
}

export function getOutrayTracer(name?: string, version?: string): Tracer {
  const config = activeInstance?.config;
  return trace.getTracer(
    name ?? config?.serviceName ?? "outray",
    version ?? config?.serviceVersion,
  );
}

/**
 * Run an application operation as a child of the currently active trace.
 * Errors are recorded and rethrown, and the span is always ended.
 */
export async function withOutraySpan<TResult>(
  name: string,
  operation: (span: Span) => TResult | Promise<TResult>,
  options: OutraySpanOptions = {},
): Promise<TResult> {
  const tracer = getOutrayTracer();
  return tracer.startActiveSpan(
    name,
    { attributes: options.attributes },
    async (span) => {
      try {
        return await operation(span);
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        if (error instanceof Error) span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export function getOutrayMeter(name?: string, version?: string): Meter {
  const config = activeInstance?.config;
  return metrics.getMeter(
    name ?? config?.serviceName ?? "outray",
    version ?? config?.serviceVersion,
  );
}

export function getOutrayLogger(name?: string, version?: string): Logger {
  const config = activeInstance?.config;
  return logs.getLogger(
    name ?? config?.serviceName ?? "outray",
    version ?? config?.serviceVersion,
  );
}

/**
 * Application logger backed by the active OutRay instance. Before OutRay is
 * initialized it behaves like console, so logging never blocks startup.
 */
export const outray: OutrayLogMethods = {
  debug: (...args) =>
    activeInstance ? activeInstance.debug(...args) : console.debug(...args),
  error: (...args) =>
    activeInstance ? activeInstance.error(...args) : console.error(...args),
  info: (...args) =>
    activeInstance ? activeInstance.info(...args) : console.info(...args),
  warn: (...args) =>
    activeInstance ? activeInstance.warn(...args) : console.warn(...args),
};

export default outray;
