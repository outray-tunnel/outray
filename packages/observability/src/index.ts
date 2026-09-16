import {
  DiagConsoleLogger,
  DiagLogLevel,
  SpanKind,
  SpanStatusCode,
  diag,
  metrics,
  trace,
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

export {
  DEFAULT_OUTRAY_OTLP_ENDPOINT,
  resolveOutrayObservabilityOptions,
  signalEndpoint,
} from "./config";
export type {
  OutrayObservabilityOptions,
  ResolvedOutrayObservabilityOptions,
} from "./config";

export interface OutrayObservability {
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
  routeResolver?: (
    request: OutrayNodeHttpRequest,
  ) => string | null | undefined;
  ignore?: (request: OutrayNodeHttpRequest) => boolean;
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

function nodeRequestPath(request: OutrayNodeHttpRequest): string {
  if (request.path?.startsWith("/")) return request.path;
  try {
    return new URL(request.originalUrl ?? request.url ?? "/", "http://outray.local")
      .pathname;
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
): void {
  const method = (request.method ?? "GET").toUpperCase();
  span.updateName(`${method} ${route}`);
  span.setAttributes({
    "http.request.method": method,
    "http.route": route,
    "url.path": nodeRequestPath(request),
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
  const tracer = getOutrayTracer("@outray/node-http-middleware", "0.1.1");

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

    const run = (span: Span, ownsSpan: boolean) => {
      configureNodeSpan(span, request, route!);
      let completed = false;
      const complete = () => {
        if (completed) return;
        completed = true;
        const finalRoute = matchedNodeRoute(request, route!);
        configureNodeSpan(span, request, finalRoute);
        const statusCode = response.statusCode;
        if (statusCode !== undefined) {
          span.setAttribute("http.response.status_code", statusCode);
          if (statusCode >= 500) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }
        }
        if (ownsSpan) span.end();
      };
      response.once("finish", complete);
      response.once("close", complete);
      try {
        next();
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        if (error instanceof Error) span.recordException(error);
        complete();
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
  diag.setLogger(new DiagConsoleLogger(), levels[level]);
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
    "telemetry.distro.version": "0.1.1",
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
    const disabled: OutrayObservability = {
      config,
      tracer: trace.getTracer(config.serviceName, config.serviceVersion),
      meter: metrics.getMeter(config.serviceName, config.serviceVersion),
      logger: logs.getLogger(config.serviceName, config.serviceVersion),
      started: false,
      async forceFlush() {},
      async shutdown() {},
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
  const logProcessor = new BatchLogRecordProcessor(
    {
      exporter: new OTLPLogExporter({
        url: signalEndpoint(config.endpoint, "logs"),
        headers: config.headers,
      }),
    },
  );
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

  let shutdownPromise: Promise<void> | undefined;
  const instance: OutrayObservability = {
    config,
    tracer: trace.getTracer(config.serviceName, config.serviceVersion),
    meter: metrics.getMeter(config.serviceName, config.serviceVersion),
    logger: logs.getLogger(config.serviceName, config.serviceVersion),
    started: true,
    async forceFlush() {
      await Promise.all([
        traceProcessor.forceFlush(),
        logProcessor.forceFlush(),
        metricReader.forceFlush(),
      ]);
    },
    shutdown() {
      shutdownPromise ??= sdk.shutdown();
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
