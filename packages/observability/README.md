# @outray/observability

OutRay's Node.js OpenTelemetry distribution. It sends traces, structured logs,
and metrics to OutRay over OTLP/HTTP protobuf and automatically instruments
common Node.js frameworks, clients, databases, and loggers.

## Install

```bash
npm install @outray/observability
```

Create an API token in OutRay with the **Send observability data** permission.
Keep this server-side: the token must never be bundled into browser code.

## Configure in code

OpenTelemetry must load before HTTP servers, frameworks, database clients, and
loggers. Make OutRay the first thing your server bootstrap starts, then import
the application:

```ts
// bootstrap.ts
import { startOutrayObservability } from "@outray/observability";

export const observability = startOutrayObservability({
  apiKey: "outray_your_observability_token",
  serviceName: "checkout-api",
  serviceVersion: "1.4.0",
  environment: "production",
});

await import("./server.js");
```

Run that bootstrap with an ordinary `node dist/bootstrap.js` script. Pass the
token directly as shown, but do not commit a real token to source control.
Production code can supply the same `apiKey` option from OutRay Secrets, a
deployment platform, or another server-side config source; no particular
environment-variable name is required.

The endpoint defaults to `https://ingest.outray.dev`. The package still supports
environment-variable defaults and `@outray/observability/register` as an
optional zero-code compatibility mode, but framework adapters do not require
them.

For route-aware TanStack Start spans and opt-in request/response capture,
use the server entry provided by `@outray/tanstack-start`.

## Custom telemetry

```ts
import {
  getOutrayLogger,
  getOutrayMeter,
  getOutrayTracer,
} from "@outray/observability";

const tracer = getOutrayTracer();
await tracer.startActiveSpan("charge-card", async (span) => {
  try {
    await chargeCard();
  } finally {
    span.end();
  }
});

getOutrayLogger().emit({
  severityText: "INFO",
  body: "payment accepted",
  attributes: { "payment.provider": "paystack" },
});

getOutrayMeter().createCounter("orders.created").add(1);
```

Pino, Winston, HTTP, Fetch/Undici, Express, NestJS, PostgreSQL, Redis, and many
other common Node.js libraries are automatically instrumented. OpenTelemetry
must start before those packages are imported.

## Shutdown

Flush telemetry as part of the application's existing shutdown path:

```ts
await observability.shutdown();
```

The SDK does not install signal handlers or call `process.exit`, so it does not
take ownership of application lifecycle.
