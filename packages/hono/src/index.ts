import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";
import {
  captureFetchRequest,
  captureFetchResponse,
  type HttpPayloadCaptureSetting,
} from "@outray/core";
import {
  getOutrayTracer,
  startOutrayObservability,
  type OutrayObservability,
  type OutrayObservabilityOptions,
} from "@outray/observability";
import type { Context, MiddlewareHandler } from "hono";

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTEGER_SEGMENT = /^\d+$/;
const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;
const ULID_SEGMENT = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export interface OutrayHonoRequestContext {
  context: Context;
  request: Request;
  pathname: string;
}

export interface OutrayHonoRequestOptions {
  /** Opt in to bounded, redacted request and response capture. */
  capturePayloads?: HttpPayloadCaptureSetting;
  /** Resolve a stable route template when Hono has not matched one yet. */
  routeResolver?: (
    context: OutrayHonoRequestContext,
  ) => string | null | undefined;
  /** Skip telemetry for a request. OPTIONS and /health are ignored by default. */
  ignore?: (context: OutrayHonoRequestContext) => boolean;
}

export interface OutrayHonoOptions
  extends OutrayObservabilityOptions,
    OutrayHonoRequestOptions {}

export interface OutrayHonoRegistration {
  middleware: MiddlewareHandler;
  observability: OutrayObservability;
}

export interface OutrayChildSpanOptions {
  attributes?: Attributes;
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
  context: Context,
  next: () => Promise<void>,
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
    span.setStatus({ code: SpanStatusCode.ERROR });
    if (error instanceof Error) span.recordException(error);
    throw error;
  }
}

/**
 * Create Hono middleware that instruments each matched request. Existing HTTP
 * server spans are reused; otherwise a SERVER span is created.
 */
export function createOutrayHonoMiddleware(
  options: OutrayHonoRequestOptions = {},
): MiddlewareHandler {
  const tracer = getOutrayTracer("@outray/hono", "0.1.0");

  return async (context, next) => {
    const request = context.req.raw;
    const pathname = pathnameFrom(request);
    const requestContext = { context, request, pathname };

    let ignored = defaultIgnoredRequest(request, pathname);
    try {
      ignored ||= options.ignore?.(requestContext) === true;
    } catch {
      // A telemetry filter cannot block the application request.
    }
    if (ignored) {
      await next();
      return;
    }

    let route: string | null | undefined;
    try {
      route = options.routeResolver?.(requestContext);
    } catch {
      // Fall back to the bounded route normalizer.
    }
    route ||= normalizeHonoRoute(pathname);

    const activeSpan = trace.getActiveSpan();
    if (activeSpan?.isRecording()) {
      await runInstrumentedRequest(
        context,
        next,
        options,
        activeSpan,
        pathname,
        route,
      );
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
            options,
            span,
            pathname,
            route!,
          );
        } finally {
          span.end();
        }
      },
    );
  };
}

/** Initialize OutRay and return middleware ready to register before routes. */
export function outray(options: OutrayHonoOptions): OutrayHonoRegistration {
  const { capturePayloads, routeResolver, ignore, ...observabilityOptions } =
    options;
  const observability = startOutrayObservability(observabilityOptions);
  const middleware = createOutrayHonoMiddleware({
    capturePayloads,
    routeResolver,
    ignore,
  });
  return { middleware, observability };
}

/** Add a meaningful application operation to the currently active trace. */
export async function withOutraySpan<TResult>(
  name: string,
  operation: (span: Span) => TResult | Promise<TResult>,
  options: OutrayChildSpanOptions = {},
): Promise<TResult> {
  const tracer = getOutrayTracer("@outray/hono", "0.1.0");
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

export default outray;
