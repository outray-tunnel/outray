import type { ResolvedOutrayObservabilityOptions } from "../../src/config.js";

// This shape was valid before automatic instrumentation became configurable.
// Keep existing consumers' manually constructed configs and mocks compatible.
export const legacyResolvedOptions: ResolvedOutrayObservabilityOptions = {
  enabled: true,
  apiKey: "test-token",
  serviceName: "test-service",
  endpoint: "http://127.0.0.1:4318",
  attributes: {},
  headers: {},
  metricExportIntervalMillis: 60_000,
  diagnostics: "none",
  captureConsole: false,
};
