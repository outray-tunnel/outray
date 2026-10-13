import { SpanKind, SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import {
  captureFetchRequest,
  captureFetchResponse,
  resolveHttpPayloadCapture,
  type HttpPayloadCaptureContext,
  type HttpPayloadCapturePolicy,
  type HttpPayloadCaptureSetting,
} from "@outray/core";
import {
  createOutrayHttpServerMetrics,
  getOutrayTracer,
  startOutrayObservability,
  type OutrayLogMethods,
  type OutrayObservability,
  type OutrayObservabilityOptions,
} from "@outray/observability";
export { withOutraySpan } from "@outray/observability";
import packageMetadata from "../package.json" with { type: "json" };

const OUTRAY_HONO_VERSION = packageMetadata.version;

/**
 * The small portion of Hono's context contract used by this adapter.
 * Keeping this structural prevents Hono patch releases from creating
 * incompatible private request types in consuming applications.
 */
export interface OutrayHonoContext {
  req: {
    raw: Request;
    routePath: string;
  };
  res: Response;
}

export type OutrayHonoNext = () => Promise<void>;
export type OutrayHonoMiddleware = (
  context: OutrayHonoContext,
  next: OutrayHonoNext,
) => Promise<void>;

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTEGER_SEGMENT = /^\d+$/;
const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;
const ULID_SEGMENT = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export interface OutrayHonoRequestContext extends HttpPayloadCaptureContext {
  context: OutrayHonoContext;
  request: Request;
  pathname: string;
}

export interface OutrayHonoRequestOptions
  extends HttpPayloadCapturePolicy<OutrayHonoRequestContext> {
  /** Opt in to bounded, redacted request and response capture. */
  capturePayloads?: HttpPayloadCaptureSetting;
  /** Record exception details and metric error names. Defaults to true. */
  recordExceptions?: boolean;
  /** Resolve a stable route template when Hono has not matched one yet. */
  routeResolver?: (
    context: OutrayHonoRequestContext,
  ) => string | null | undefined;
  /** Skip telemetry for a request. OPTIONS and /health are ignored by default. */
  ignore?: (context: OutrayHonoRequestContext) => boolean;
  /** Keep OPTIONS and /health requests excluded by default. */
  ignoreDefaultPaths?: boolean;
}

export interface OutrayHonoOptions
  extends OutrayObservabilityOptions, OutrayHonoRequestOptions {}

export interface OutrayHonoRegistration extends OutrayLogMethods {
  middleware: OutrayHonoMiddleware;
  observability: OutrayObservability;
}

/** Convert common identifier segments to `:id` for bounded route cardinality. */
export function normalizeHonoRoute(pathname: string): string {
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

  const route = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return (route || "/").slice(0, 256);
}

function pathnameFrom(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "/";
  }
}

function defaultIgnoredRequest(request: Request, pathname: string): boolean {
  return request.method.toUpperCase() === "OPTIONS" || pathname === "/health";
}

function configureSpan(
  span: Span,
  request: Request,
  pathname: string,
  route: string,
): void {
  const method = request.method.toUpperCase();
  span.updateName(`${method} ${route}`);
  span.setAttributes({
    "http.request.method": method,
    "http.route": route,
    "url.path": pathname,
    "outray.framework": "hono",
  });
}

async function captureRequestSafely(
  request: Request,
  setting: HttpPayloadCaptureSetting,
): Promise<void> {
  try {
    await captureFetchRequest(request.clone(), setting);
  } catch {
    // Observability must never consume or fail an application request.
  }
}

async function captureResponseSafely(
  response: Response,
  setting: HttpPayloadCaptureSetting,
): Promise<void> {
  try {
    await captureFetchResponse(response.clone(), setting);
  } catch {
    // Observability must never consume or replace an application response.
  }
}

async function runInstrumentedRequest(
  context: OutrayHonoContext,
  next: OutrayHonoNext,
  options: OutrayHonoRequestOptions,
  span: Span,
  pathname: string,
  fallbackRoute: string,
): Promise<void> {
  const request = context.req.raw;
  configureSpan(span, request, pathname, fallbackRoute);

  try {
    if (options.capturePayloads) {
      await captureRequestSafely(request, options.capturePayloads);
    }

    await next();

    const route = context.req.routePath || fallbackRoute;
    configureSpan(span, request, pathname, route);
    span.setAttribute("http.response.status_code", context.res.status);
    if (context.res.status >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }

    if (options.capturePayloads) {
      await captureResponseSafely(context.res, options.capturePayloads);
    }
  } catch (error) {
    span.setAttribute(
      "http.response.status_code",
      context.res?.status >= 500 ? context.res.status : 500,
    );
    span.setStatus({ code: SpanStatusCode.ERROR });
    if (options.recordExceptions !== false && error instanceof Error) {
      span.recordException(error);
    }
    throw error;
  }
}

/**
 * Create Hono middleware that instruments each matched request. Existing HTTP
 * server spans are reused; otherwise a SERVER span is created.
 */
export function createOutrayHonoMiddleware(
  options: OutrayHonoRequestOptions = {},
): OutrayHonoMiddleware {
  const tracer = getOutrayTracer("@outray/hono", OUTRAY_HONO_VERSION);
  const requestMetrics = createOutrayHttpServerMetrics({
    framework: "hono",
    instrumentationName: "@outray/hono",
    instrumentationVersion: OUTRAY_HONO_VERSION,
  });

  return async (context, next) => {
    const request = context.req.raw;
    const pathname = pathnameFrom(request);
    const requestContext = {
      context,
      request,
      pathname,
      method: request.method,
    };

    let ignored =
      options.ignoreDefaultPaths !== false && defaultIgnoredRequest(request, pathname);
    try {
      ignored ||= options.ignore?.(requestContext) === true;
    } catch {
      // A telemetry filter cannot block the application request.
    }
    if (ignored) {
      await next();
      return;
    }

    const requestOptions = {
      capturePayloads: resolveHttpPayloadCapture(
        options.capturePayloads,
        requestContext,
        options,
      ),
      recordExceptions: options.recordExceptions,
    };

    let route: string | null | undefined;
    try {
      route = options.routeResolver?.(requestContext);
    } catch {
      // Fall back to the bounded route normalizer.
    }
    route ||= normalizeHonoRoute(pathname);
    const finishMetrics = requestMetrics.start({
      method: request.method,
      route,
    });

    const activeSpan = trace.getActiveSpan();
    if (activeSpan?.isRecording()) {
      try {
        await runInstrumentedRequest(
          context,
          next,
          requestOptions,
          activeSpan,
          pathname,
          route,
        );
        finishMetrics({
          statusCode: context.res.status,
          route: context.req.routePath || route,
        });
      } catch (error) {
        finishMetrics({
          statusCode: context.res?.status >= 500 ? context.res.status : 500,
          errorType:
            options.recordExceptions === false
              ? undefined
              : error instanceof Error ? error.name : "Error",
          route: context.req.routePath || route,
        });
        throw error;
      }
      return;
    }

    await tracer.startActiveSpan(
      `${request.method.toUpperCase()} ${route}`,
      { kind: SpanKind.SERVER },
      async (span) => {
        try {
          await runInstrumentedRequest(
            context,
            next,
            requestOptions,
            span,
            pathname,
            route!,
          );
          finishMetrics({
            statusCode: context.res.status,
            route: context.req.routePath || route!,
          });
        } catch (error) {
          finishMetrics({
            statusCode: context.res?.status >= 500 ? context.res.status : 500,
            errorType:
              options.recordExceptions === false
                ? undefined
                : error instanceof Error ? error.name : "Error",
            route: context.req.routePath || route!,
          });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  };
}

/** Initialize OutRay and return middleware ready to register before routes. */
export function outray(options: OutrayHonoOptions): OutrayHonoRegistration {
  const {
    capturePayloads,
    shouldCapturePayloads,
    recordExceptions,
    routeResolver,
    ignore,
    ignoreDefaultPaths,
    ...observabilityOptions
  } = options;
  const observability = startOutrayObservability(observabilityOptions);
  const middleware = createOutrayHonoMiddleware({
    capturePayloads,
    shouldCapturePayloads,
    recordExceptions,
    routeResolver,
    ignore,
    ignoreDefaultPaths,
  });
  return {
    middleware,
    observability,
    debug: observability.debug,
    error: observability.error,
    info: observability.info,
    warn: observability.warn,
  };
}

export default outray;
