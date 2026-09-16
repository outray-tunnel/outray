import {
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import {
  captureFetchRequest,
  captureFetchResponse,
  type HttpPayloadCaptureSetting,
} from "@outray/core";
import { createMiddleware } from "@tanstack/react-start";

const tracer = trace.getTracer("@outray/tanstack-start", "0.1.1");

const DEFAULT_IGNORED_PREFIXES = [
  "/@fs/",
  "/@id/",
  "/@vite/",
  "/__vite/",
  "/node_modules/",
  "/assets/",
] as const;

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTEGER_SEGMENT = /^\d+$/;
const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;
const ULID_SEGMENT = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export interface OutrayTanStackRouteContext {
  request: Request;
  pathname: string;
}

export interface OutrayTanStackStartOptions {
  /**
   * Opt in to bounded and redacted request/response capture. Disabled by
   * default. Values use the same safety limits as the other OutRay adapters.
   */
  capturePayloads?: HttpPayloadCaptureSetting;
  /**
   * Resolve the low-cardinality route template used for the span name and
   * `http.route`. Return null to use OutRay's identifier normalization.
   */
  routeResolver?: (
    context: OutrayTanStackRouteContext,
  ) => string | null | undefined;
  /** Skip telemetry for a request. Framework asset paths are skipped by default. */
  ignore?: (context: OutrayTanStackRouteContext) => boolean;
}

export interface OutrayTanStackRequestContext<TResult = unknown> {
  request: Request;
  pathname?: string;
  next: () => TResult | Promise<TResult>;
}

function requestPathname(request: Request, pathname?: string): string {
  if (pathname?.startsWith("/")) return pathname;
  try {
    return new URL(request.url).pathname;
  } catch {
    return "/";
  }
}

function isIdentifierSegment(segment: string): boolean {
  return (
    UUID_SEGMENT.test(segment) ||
    INTEGER_SEGMENT.test(segment) ||
    LONG_HEX_SEGMENT.test(segment) ||
    ULID_SEGMENT.test(segment)
  );
}

/**
 * Convert obvious identifiers to `:id` so default span names do not create
 * unbounded cardinality. Applications can provide exact templates through
 * `routeResolver` when slugs or other identifiers need normalizing.
 */
export function normalizeTanStackRoute(pathname: string): string {
  const normalized = pathname
    .split("/")
    .map((segment) => (isIdentifierSegment(segment) ? ":id" : segment))
    .join("/");
  const route = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return (route || "/").slice(0, 256);
}

export function isDefaultIgnoredTanStackPath(pathname: string): boolean {
  return (
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    DEFAULT_IGNORED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function responseFrom(result: unknown): Response | undefined {
  if (result instanceof Response) return result;
  if (
    result &&
    typeof result === "object" &&
    "response" in result &&
    result.response instanceof Response
  ) {
    return result.response;
  }
  return undefined;
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

function handlerType(request: Request): string {
  return request.headers.get("x-tsr-serverfn") === "true"
    ? "server-function"
    : "request";
}

function configureSpan(span: Span, request: Request, route: string): void {
  const method = request.method.toUpperCase();
  span.updateName(`${method} ${route}`);
  span.setAttributes({
    "http.request.method": method,
    "http.route": route,
    "outray.framework": "tanstack-start",
    "outray.tanstack.handler_type": handlerType(request),
  });
}

async function runInstrumentedRequest<TResult>(
  context: OutrayTanStackRequestContext<TResult>,
  options: OutrayTanStackStartOptions,
  span: Span,
  route: string,
): Promise<TResult> {
  configureSpan(span, context.request, route);
  try {
    if (options.capturePayloads) {
      await captureRequestSafely(context.request, options.capturePayloads);
    }

    const result = await context.next();
    const response = responseFrom(result);
    if (response) {
      span.setAttribute("http.response.status_code", response.status);
      if (response.status >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }

      if (options.capturePayloads) {
        await captureResponseSafely(response, options.capturePayloads);
      }
    }
    return result;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    if (error instanceof Error) span.recordException(error);
    throw error;
  }
}

/**
 * Execute one TanStack Start request inside the current HTTP span. If the app
 * was not preloaded with HTTP instrumentation, a server span is created so the
 * middleware remains useful with any OpenTelemetry provider.
 */
export async function instrumentTanStackRequest<TResult>(
  context: OutrayTanStackRequestContext<TResult>,
  options: OutrayTanStackStartOptions = {},
): Promise<TResult> {
  const pathname = requestPathname(context.request, context.pathname);
  const routeContext = { request: context.request, pathname };
  let ignored = isDefaultIgnoredTanStackPath(pathname);
  try {
    ignored ||= options.ignore?.(routeContext) === true;
  } catch {
    // A telemetry filter cannot block the application request.
  }
  if (ignored) {
    return await context.next();
  }

  let route: string | null | undefined;
  try {
    route = options.routeResolver?.(routeContext);
  } catch {
    // Fall back to the bounded route normalizer.
  }
  route ||= normalizeTanStackRoute(pathname);
  const activeSpan = trace.getActiveSpan();
  if (activeSpan?.isRecording()) {
    return runInstrumentedRequest(context, options, activeSpan, route);
  }

  return tracer.startActiveSpan(
    `${context.request.method.toUpperCase()} ${route}`,
    { kind: SpanKind.SERVER },
    async (span) => {
      try {
        return await runInstrumentedRequest(context, options, span, route);
      } finally {
        span.end();
      }
    },
  );
}

/** Create a global TanStack Start request middleware for `src/start.ts`. */
export function createOutrayTanStackMiddleware(
  options: OutrayTanStackStartOptions = {},
) {
  return createMiddleware().server(({ request, pathname, next }) =>
    instrumentTanStackRequest({ request, pathname, next }, options),
  );
}

export type { HttpPayloadCaptureOptions } from "@outray/core";
