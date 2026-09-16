import { startOutrayObservability } from "./index";

/**
 * Zero-code ESM preload entry point.
 *
 * OUTRAY_API_KEY and OTEL_SERVICE_NAME are required when enabled.
 */
export const outrayObservability = startOutrayObservability();
