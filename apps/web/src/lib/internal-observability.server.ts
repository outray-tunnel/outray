import { AsyncLocalStorage } from "node:async_hooks";
import type { OutrayTanStackServerOptions } from "@outray/tanstack-start/server";

const PRIVATE_PATH_SEGMENTS = new Set([
  "auth", "secrets", "login", "logout", "signup", "register", "cli",
  "auth-tokens", "machine-tokens", "tokens", "invitations", "invite",
  "webhooks", "checkout", "admin", "_serverfn",
]);

const logCaptureScope = new AsyncLocalStorage<boolean>();

/** Credential and secret routes bypass request and payload capture. */
export function ignoreInternalObservabilityRequest({ pathname }: { pathname: string }): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname).toLowerCase();
  } catch {
    // Malformed paths may contain unrecognized sensitive route segments.
    return true;
  }
  const segments = decoded.split("/").filter(Boolean);
  return segments.some((segment) =>
    PRIVATE_PATH_SEGMENTS.has(segment)
    || segment.endsWith("-token")
    || segment.endsWith(".callback")
    || segment === "callback",
  ) || /^\/v1\/(traces|logs|metrics)(?:\/|$)/.test(decoded);
}

/** Keep global console capture out of sensitive requests, including async work. */
export function shouldCaptureInternalObservabilityLog(): boolean {
  return logCaptureScope.getStore() !== false;
}

export function runWithInternalObservabilityRequest<TResult>(
  request: Request,
  next: () => TResult,
): TResult {
  let allowed = false;
  try {
    allowed = !ignoreInternalObservabilityRequest({ pathname: new URL(request.url).pathname });
  } catch {
    // A malformed capture context cannot export logs or block the application.
  }
  return logCaptureScope.run(allowed, next);
}

/**
 * A dedicated, server-only credential opts the console into internal Ops.
 * Generic tunnel/SDK environment variables never enable this integration.
 */
export function resolveInternalObservabilityOptions(
  env: Record<string, string | undefined>,
): OutrayTanStackServerOptions | undefined {
  const apiKey = env.OUTRAY_INTERNAL_OBSERVABILITY_API_KEY?.trim();
  if (!apiKey) return undefined;

  let endpoint: URL;
  try {
    endpoint = new URL(env.OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT ?? "");
  } catch {
    throw new Error("OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT must be an HTTPS origin.");
  }
  if (
    endpoint.protocol !== "https:"
    || endpoint.username || endpoint.password
    || endpoint.search || endpoint.hash
    || endpoint.pathname !== "/"
  ) {
    throw new Error("OUTRAY_INTERNAL_OBSERVABILITY_ENDPOINT must be an HTTPS origin without credentials, path, query, or fragment.");
  }

  return {
    apiKey,
    endpoint: endpoint.origin,
    serviceName: env.OUTRAY_INTERNAL_OBSERVABILITY_SERVICE_NAME?.trim() || "outray-web",
    environment: env.OUTRAY_INTERNAL_OBSERVABILITY_ENVIRONMENT?.trim() || "production",
    enabled: true,
    capturePayloads: {
      maxBodyBytes: 16 * 1024,
      maxHeaderBytes: 8 * 1024,
      // These routes can return another user's already-captured payload as an
      // opaque string. Never forward those nested bodies/headers to Ops.
      redactedFields: ["requestBody", "responseBody", "requestHeaders", "responseHeaders", "body", "params"],
    },
    captureConsole: true,
    shouldCaptureLog: shouldCaptureInternalObservabilityLog,
    recordExceptions: false,
    autoInstrumentations: false,
    diagnostics: "none",
    ignore: ignoreInternalObservabilityRequest,
  };
}
