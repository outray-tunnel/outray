# @outray/hono

Hono request tracing, logs, metrics, and safe payload capture for OutRay.

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
