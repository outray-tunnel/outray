import {
  startOutrayObservability,
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
  extends OutrayObservabilityOptions,
    OutrayTanStackStartOptions {}

export interface OutrayTanStackServerEntry {
  fetch: RequestHandler<unknown>;
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

  startOutrayObservability(observabilityOptions);

  const handleRequest = createStartHandler(defaultStreamHandler);
  return {
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
