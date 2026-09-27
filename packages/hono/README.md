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
