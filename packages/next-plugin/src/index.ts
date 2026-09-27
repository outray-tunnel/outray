import type { NextConfig } from "next";
import { SpanKind, SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import {
  OutrayClient,
  LocalAccessManager,
  captureFetchRequest,
  captureFetchResponse,
  isHttpPayloadCaptureActive,
} from "@outray/core";
import {
  createOutrayHttpServerMetrics,
  getOutrayTracer,
} from "@outray/observability";
import type {
  OutrayNextRequestContext,
  OutrayNextRequestOptions,
  OutrayPayloadCaptureOptions,
  OutrayPluginOptions,
} from "./types";
import packageMetadata from "../package.json" with { type: "json" };
export { withOutraySpan } from "@outray/observability";

const DEFAULT_SERVER_URL = "wss://api.outray.dev/";
const OUTRAY_NEXT_VERSION = packageMetadata.version;
let nextRequestMetrics:
  | ReturnType<typeof createOutrayHttpServerMetrics>
  | undefined;

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTEGER_SEGMENT = /^\d+$/;
const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;
const ULID_SEGMENT = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const DEFAULT_IGNORED_PREFIXES = ["/_next/", "/assets/"] as const;

function getNextRequestMetrics() {
  nextRequestMetrics ??= createOutrayHttpServerMetrics({
    framework: "nextjs",
    instrumentationName: "@outray/next",
    instrumentationVersion: OUTRAY_NEXT_VERSION,
  });
  return nextRequestMetrics;
}

let client: OutrayClient | null = null;
let localAccess: LocalAccessManager | null = null;
let tunnelStarted = false;

/**
 * Next.js plugin that automatically starts an Outray tunnel when the dev server starts.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import withOutray from '@outray/next'
 *
 * export default withOutray({
 *   // your next config
 * })
 * ```
 *
 * @example
 * ```ts
 * // With options
 * import withOutray from '@outray/next'
 *
 * export default withOutray(
 *   {
 *     // your next config
 *   },
 *   {
 *     subdomain: 'my-app',
 *     apiKey: process.env.OUTRAY_API_KEY,
 *   }
 * )
 * ```
 */
export default function withOutray(
  nextConfig: NextConfig = {},
  options: OutrayPluginOptions = {},
): NextConfig {
  const {
    enabled = process.env.OUTRAY_ENABLED !== "false",
    silent = false,
    local = false,
  } = options;

  // Only run in development
  if (process.env.NODE_ENV !== "development" || !enabled) {
    return nextConfig;
  }

  // Start tunnel immediately when config is loaded (dev server startup)
  if (!tunnelStarted) {
    tunnelStarted = true;

    // Small delay to let the server bind to the port first
    setTimeout(() => {
      startTunnel(options, silent, local);
    }, 2000);
  }

  return nextConfig;
}

function startTunnel(
  options: OutrayPluginOptions,
  silent: boolean,
  local: boolean,
): void {
  const port = parseInt(process.env.PORT || "3000", 10);
  const apiKey = options.apiKey ?? process.env.OUTRAY_API_KEY;
  const subdomain = options.subdomain ?? process.env.OUTRAY_SUBDOMAIN;
  const serverUrl =
    options.serverUrl ?? process.env.OUTRAY_SERVER_URL ?? DEFAULT_SERVER_URL;

  // Start local access if enabled
  if (local) {
    const localSubdomain = subdomain || `next-${port}`;
    localAccess = new LocalAccessManager(port, localSubdomain);
    localAccess
      .start()
      .then((info) => {
        if (!silent) {
          console.log(`  \x1b[34m📡\x1b[0m \x1b[1mLAN:\x1b[0m`);
          if (info.httpsUrl) {
            const trustNote = info.httpsIsTrusted
              ? ""
              : " \x1b[33m(self-signed)\x1b[0m";
            console.log(`       \x1b[36m${info.httpsUrl}\x1b[0m${trustNote}`);
          }
          if (info.httpUrl) {
            console.log(`       \x1b[36m${info.httpUrl}\x1b[0m`);
          }
          if (!info.httpsUrl && !info.httpUrl) {
            console.log(
              `       \x1b[36mhttp://${info.hostname}:${info.port}\x1b[0m`,
            );
            console.log(
              `       \x1b[33m(Run with sudo for ports 80/443)\x1b[0m`,
            );
          }
          console.log(
            `       \x1b[2mhttp://${info.ip}:${info.port} (Android)\x1b[0m`,
          );
        }
        options.onLocalReady?.(info);
      })
      .catch(() => {
        if (!silent) {
          console.log(`  \x1b[33m○\x1b[0m  Outray: mDNS unavailable`);
        }
      });
  }

  client = new OutrayClient({
    localPort: port,
    serverUrl,
    apiKey,
    subdomain,
    customDomain: options.customDomain,
    onTunnelReady: (url) => {
      if (!silent) {
        const colorUrl = `\x1b[36m${url}\x1b[0m`;
        console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mTunnel:\x1b[0m  ${colorUrl}`);
      }
      options.onTunnelReady?.(url);
    },
    onError: (error) => {
      if (!silent) {
        console.error(`  \x1b[31m✗\x1b[0m  Outray: ${error.message}`);
      }
      options.onError?.(error);
    },
    onReconnecting: (attempt, delay) => {
      if (!silent) {
        console.log(
          `  \x1b[33m⟳\x1b[0m  Outray: Reconnecting in ${Math.round(delay / 1000)}s...`,
        );
      }
      options.onReconnecting?.();
    },
    onClose: () => {
      if (!silent) {
        console.log(`  \x1b[33m○\x1b[0m  Outray: Tunnel closed`);
      }
      options.onClose?.();
    },
  });

  client.start();

  // Cleanup on process exit
  const cleanup = () => {
    if (localAccess) {
      localAccess.stop();
      localAccess = null;
    }
    if (client) {
      client.stop();
      client = null;
    }
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", cleanup);
}

function pathnameFrom(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "/";
  }
}

/** Convert common identifier segments to `:id` for bounded route cardinality. */
export function normalizeNextRoute(pathname: string): string {
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

function isDefaultIgnoredNextPath(pathname: string): boolean {
  return (
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    DEFAULT_IGNORED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function configureNextSpan(
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
    "outray.framework": "nextjs",
  });
}

async function runNextHandler<
  Arguments extends unknown[],
  Result extends Response,
>(
  handler: (request: Request, ...args: Arguments) => Result | Promise<Result>,
  request: Request,
  args: Arguments,
  options: OutrayNextRequestOptions,
  span: Span,
  pathname: string,
  route: string,
): Promise<Result> {
  configureNextSpan(span, request, pathname, route);

  let requestClone: Request | undefined;
  if (
    options.capturePayloads &&
    isHttpPayloadCaptureActive(options.capturePayloads)
  ) {
    try {
      requestClone = request.clone();
    } catch {
      // A previously-consumed request cannot be cloned; the handler still runs.
    }
  }

  let result: Result | Promise<Result>;
  try {
    result = handler(request, ...args);
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    if (error instanceof Error) span.recordException(error);
    throw error;
  }

  const requestCapture =
    requestClone && options.capturePayloads
      ? captureFetchRequest(requestClone, options.capturePayloads).catch(
          () => undefined,
        )
      : Promise.resolve();

  let response: Result;
  try {
    response = await result;
  } catch (error) {
    await requestCapture;
    span.setStatus({ code: SpanStatusCode.ERROR });
    if (error instanceof Error) span.recordException(error);
    throw error;
  }

  await requestCapture;
  span.setAttribute("http.response.status_code", response.status);
  if (response.status >= 500) {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }

  if (
    options.capturePayloads &&
    isHttpPayloadCaptureActive(options.capturePayloads)
  ) {
    try {
      await captureFetchResponse(response.clone(), options.capturePayloads);
    } catch {
      // Streaming/framework-specific responses are allowed to be unclonable.
    }
  }

  return response;
}

/**
 * Instrument an App Router route handler with route-aware traces and HTTP
 * server metrics. Payload capture remains opt-in.
 */
export function withOutrayRequest<
  Arguments extends unknown[],
  Result extends Response,
>(
  handler: (request: Request, ...args: Arguments) => Result | Promise<Result>,
  options: OutrayNextRequestOptions = {},
): (request: Request, ...args: Arguments) => Promise<Result> {
  return async (request: Request, ...args: Arguments): Promise<Result> => {
    const pathname = pathnameFrom(request);
    const requestContext: OutrayNextRequestContext = { request, pathname };
    let ignored = isDefaultIgnoredNextPath(pathname);
    try {
      ignored ||= options.ignore?.(requestContext) === true;
    } catch {
      // A telemetry filter cannot block the application request.
    }
    if (ignored) return handler(request, ...args);

    let route: string | null | undefined;
    try {
      route = options.routeResolver?.(requestContext);
    } catch {
      // Fall back to bounded identifier normalization.
    }
    route ||= normalizeNextRoute(pathname);

    const finishMetrics = getNextRequestMetrics().start({
      method: request.method,
      route,
    });
    const execute = async (span: Span): Promise<Result> => {
      try {
        const response = await runNextHandler(
          handler,
          request,
          args,
          options,
          span,
          pathname,
          route!,
        );
        finishMetrics({ statusCode: response.status, route: route! });
        return response;
      } catch (error) {
        finishMetrics({
          statusCode: 500,
          errorType: error instanceof Error ? error.name : "Error",
          route: route!,
        });
        throw error;
      }
    };

    const activeSpan = trace.getActiveSpan();
    if (activeSpan?.isRecording()) return execute(activeSpan);

    return getOutrayTracer("@outray/next", OUTRAY_NEXT_VERSION).startActiveSpan(
      `${request.method.toUpperCase()} ${route}`,
      { kind: SpanKind.SERVER },
      async (span) => {
        try {
          return await execute(span);
        } finally {
          span.end();
        }
      },
    );
  };
}

/**
 * Opt-in payload capture for App Router route handlers.
 *
 * The request and response streams returned to Next.js are never consumed or
 * replaced. Bounded clones are inspected before the handler completes so the
 * attributes reach the already-active OpenTelemetry server span.
 *
 * @example
 * ```ts
 * import { withOutrayPayloadCapture } from '@outray/next'
 *
 * export const POST = withOutrayPayloadCapture(async (request) => {
 *   return Response.json({ ok: true })
 * })
 * ```
 */
export function withOutrayPayloadCapture<
  Arguments extends unknown[],
  Result extends Response,
>(
  handler: (request: Request, ...args: Arguments) => Result | Promise<Result>,
  captureOptions: OutrayPayloadCaptureOptions = true,
): (request: Request, ...args: Arguments) => Promise<Result> {
  return withOutrayRequest(handler, { capturePayloads: captureOptions });
}

// Named exports for better tree-shaking
export { withOutray };
export type {
  OutrayNextRequestContext,
  OutrayNextRequestOptions,
  OutrayPayloadCaptureOptions,
  OutrayPluginOptions,
};
