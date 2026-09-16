import {
  startOutrayObservability,
  type OutrayObservability,
  type OutrayObservabilityOptions,
} from "@outray/observability";

/** Initialize OutRay from Next.js's server-side instrumentation hook. */
export function registerOutrayObservability(
  options: OutrayObservabilityOptions,
): OutrayObservability {
  return startOutrayObservability(options);
}

export type {
  OutrayObservability,
  OutrayObservabilityOptions,
} from "@outray/observability";
