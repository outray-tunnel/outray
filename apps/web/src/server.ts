import type { RequestHandler } from "@tanstack/react-start/server";
import {
  resolveInternalObservabilityOptions,
  runWithInternalObservabilityRequest,
} from "./lib/internal-observability.server";

const observabilityOptions = resolveInternalObservabilityOptions(process.env);

// Load the SDK only when explicitly enabled. The adapter initializes it before
// TanStack loads application routes; src/start.ts still owns instance policy.
const server: { fetch: RequestHandler<unknown> } = observabilityOptions
  ? (await import("@outray/tanstack-start/server")).createOutrayTanStackServerEntry(observabilityOptions)
  : await (async () => {
    const { createStartHandler, defaultStreamHandler } = await import("@tanstack/react-start/server");
    return { fetch: createStartHandler(defaultStreamHandler) };
  })();

const entry: { fetch: RequestHandler<unknown> } = observabilityOptions
  ? {
    fetch(request, requestOptions) {
      return runWithInternalObservabilityRequest(request, () => server.fetch(request, requestOptions));
    },
  }
  : server;

export default entry;
