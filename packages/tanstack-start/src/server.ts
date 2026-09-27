import {
  startOutrayObservability,
  type OutrayLogMethods,
  type OutrayObservability,
  type OutrayObservabilityOptions,
} from "@outray/observability";
import {
  createStartHandler,
  defaultStreamHandler,
  type RequestHandler,
} from "@tanstack/react-start/server";
import {
  instrumentTanStackRequest,
  type OutrayTanStackStartOptions,
} from "./index.js";

export interface OutrayTanStackServerOptions
  extends OutrayObservabilityOptions, OutrayTanStackStartOptions {}

export interface OutrayTanStackServerEntry extends OutrayLogMethods {
  fetch: RequestHandler<unknown>;
  observability: OutrayObservability;
}

/**
 * Create a TanStack Start Node/Nitro server entry with OutRay initialized
 * before TanStack loads the application's routes.
 */
export function createOutrayTanStackServerEntry(
  options: OutrayTanStackServerOptions,
): OutrayTanStackServerEntry {
  const { capturePayloads, routeResolver, ignore, ...observabilityOptions } =
    options;

  const observability = startOutrayObservability(observabilityOptions);

  const handleRequest = createStartHandler(defaultStreamHandler);
  return {
    observability,
    debug: observability.debug,
    error: observability.error,
    info: observability.info,
    warn: observability.warn,
    fetch(request, requestOptions) {
      return instrumentTanStackRequest(
        {
          request,
          next: () => handleRequest(request, requestOptions),
        },
        { capturePayloads, routeResolver, ignore },
      );
    },
  };
}

export type { OutrayObservabilityOptions } from "@outray/observability";
