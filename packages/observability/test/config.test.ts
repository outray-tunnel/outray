import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveOutrayObservabilityOptions,
  signalEndpoint,
} from "../src/config";

test("resolves the OutRay environment contract without exposing credentials", () => {
  const resolved = resolveOutrayObservabilityOptions(
    { headers: { authorization: "Bearer wrong", "x-tenant": "test" } },
    {
      OUTRAY_API_KEY: "secret-token",
      OUTRAY_OTLP_ENDPOINT: "https://ingest.example.test/base/",
      OTEL_SERVICE_NAME: "checkout-api",
      OTEL_SERVICE_VERSION: "2.1.0",
      OTEL_SERVICE_NAMESPACE: "payments",
      NODE_ENV: "staging",
    },
  );

  assert.equal(resolved.serviceName, "checkout-api");
  assert.equal(resolved.serviceVersion, "2.1.0");
  assert.equal(resolved.serviceNamespace, "payments");
  assert.equal(resolved.environment, "staging");
  assert.equal(resolved.endpoint, "https://ingest.example.test/base");
  assert.equal(resolved.headers.Authorization, "Bearer secret-token");
  assert.equal(resolved.headers.authorization, undefined);
  assert.equal(resolved.headers["x-tenant"], "test");
  assert.equal(
    signalEndpoint(resolved.endpoint, "logs"),
    "https://ingest.example.test/base/v1/logs",
  );
});

test("fails closed when enabled configuration is incomplete", () => {
  assert.throws(
    () => resolveOutrayObservabilityOptions({}, {}),
    /requires serviceName/,
  );
  assert.throws(
    () =>
      resolveOutrayObservabilityOptions(
        { serviceName: "api" },
        {},
      ),
    /requires apiKey/,
  );
});

test("disabled telemetry does not require a service or credential", () => {
  const resolved = resolveOutrayObservabilityOptions(
    {},
    { OUTRAY_OBSERVABILITY_ENABLED: "false" },
  );
  assert.equal(resolved.enabled, false);
});

test("rejects unsafe endpoints and impractical metric intervals", () => {
  assert.throws(
    () =>
      resolveOutrayObservabilityOptions(
        { apiKey: "token", serviceName: "api", endpoint: "file:///tmp/otlp" },
        {},
      ),
    /must use http or https/,
  );
  assert.throws(
    () =>
      resolveOutrayObservabilityOptions(
        { apiKey: "token", serviceName: "api", metricExportIntervalMillis: 10 },
        {},
      ),
    /at least 1000/,
  );
});
