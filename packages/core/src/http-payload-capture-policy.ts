import type { HttpPayloadCaptureSetting } from "./http-payload-capture";

/** Framework-neutral request metadata used to decide whether content is safe to capture. */
export interface HttpPayloadCaptureContext {
  pathname: string;
  method?: string;
}

export interface HttpPayloadCapturePolicy<TContext = HttpPayloadCaptureContext> {
  /**
   * Opt out of headers and bodies for individual requests without disabling
   * request spans or metrics. Only an explicit true permits capture; errors
   * fail closed. This callback must be synchronous.
   */
  shouldCapturePayloads?: (context: TContext) => boolean;
}

/** Resolve a request's content policy before reading or cloning its payloads. */
export function resolveHttpPayloadCapture<TContext>(
  setting: HttpPayloadCaptureSetting | undefined,
  context: TContext,
  policy?: HttpPayloadCapturePolicy<TContext>,
): HttpPayloadCaptureSetting {
  if (setting === undefined || setting === false) return false;

  try {
    const predicate = policy?.shouldCapturePayloads;
    if (predicate === undefined) return setting;

    const decision: unknown = predicate(context);
    if (decision === true) return setting;

    // Async callbacks are unsupported and must not enable capture or produce
    // an unhandled rejection if a JavaScript caller accidentally supplies one.
    if (
      decision !== null &&
      (typeof decision === "object" || typeof decision === "function") &&
      typeof (decision as { then?: unknown }).then === "function"
    ) {
      void Promise.resolve(decision).catch(() => {});
    }
  } catch {
    // Policy failures must never expose content or interrupt the application.
  }

  return false;
}
