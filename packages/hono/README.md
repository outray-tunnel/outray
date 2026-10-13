# @outray/hono

Hono request tracing, logs, metrics, and safe payload capture for OutRay.

Every instrumented request automatically records
`http.server.request.count`, `http.server.request.duration`, and
`http.server.active_requests` with the matched Hono route template.

## Installation

```bash
npm install @outray/hono
```

## Usage

Register the middleware before application routes:

```ts
import { Hono } from "hono"
import outray from "@outray/hono"

const app = new Hono()
const telemetry = outray({
  apiKey: process.env.OUTRAY_API_KEY,
  serviceName: "orders-api",
  serviceVersion: process.env.GIT_COMMIT_SHA,
  environment: process.env.NODE_ENV,
  captureConsole: true,
  capturePayloads: {
    maxBodyBytes: 16 * 1024,
  },
})

app.use("*", telemetry.middleware)

app.get("/orders/:orderId", async (context) => {
  return context.json({ id: context.req.param("orderId") })
})

export default app
```

The returned object also exposes first-class logging methods:

```ts
telemetry.info("order created", { orderId })
telemetry.error("order failed", error, { orderId })
```

With `captureConsole: true`, existing `console.debug`, `console.info`,
`console.log`, `console.warn`, and `console.error` calls are sent to OutRay too,
without removing their normal process output. Console capture is opt-in and is
restored when `telemetry.observability.shutdown()` runs.

Pass the token from a server-only secret provider and do not commit it to source
control. `OPTIONS` requests and `/health` are ignored by default. Hono's matched
route template is used for span names, keeping identifiers out of operation
names and avoiding unbounded cardinality.

Payload capture is disabled unless `capturePayloads` is configured. Eligible
JSON and form payloads are bounded and sensitive headers and fields are
redacted. Streaming, multipart, compressed, XML, and binary bodies are not
captured.

Set `shouldCapturePayloads: ({ pathname, method }) => boolean` alongside an
enabled `capturePayloads` setting to decide which requests can have content
captured. This policy uses the shared core resolver: it runs once per
instrumented request, treats non-`true` results and thrown errors as capture
disabled, and never mutates shared settings. Excluded content is not cloned or
read, but the request still records route, status, timing, and HTTP metrics.

```ts
const telemetry = outray({
  apiKey: process.env.OUTRAY_API_KEY,
  serviceName: "orders-api",
  capturePayloads: true,
  shouldCapturePayloads: ({ pathname }) => !pathname.startsWith("/api/secrets/"),
  recordExceptions: false,
  ignoreDefaultPaths: false,
})
```

`ignoreDefaultPaths: false` also instruments `/health` and `OPTIONS` requests;
explicit `ignore` callbacks still take precedence. Defaults are unchanged.
`recordExceptions: false` omits exception details and exception-derived metric
error names, while preserving thrown errors and generic failure status. Payload
policy does not suppress application logs or sanitize custom route names. Keep
console capture disabled, or supply an appropriate `shouldCaptureLog` policy,
when handlers may log private data.
The raw pathname is still included as `url.path` request metadata, even when a
`routeResolver` supplies a sanitized `http.route`. The content gate is not a
blanket privacy filter: never put secret values in URLs, and apply a separate
metadata policy if your application needs path-value suppression.

## Application spans

Use `withOutraySpan` when a library does not already emit OpenTelemetry spans:

```ts
import { withOutraySpan } from "@outray/hono"

const file = await withOutraySpan(
  "db findOne file",
  () => database.findFile(fileId),
  { attributes: { "db.system.name": "postgresql" } },
)
```

The operation becomes a child of the current request and records thrown errors
without changing application behavior.
