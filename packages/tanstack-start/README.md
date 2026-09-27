# @outray/tanstack-start

Every instrumented request automatically records
`http.server.request.count`, `http.server.request.duration`, and
`http.server.active_requests` using bounded route attributes.

TanStack Start server-request instrumentation for OutRay. It gives incoming
requests low-cardinality route names, records response status and failures, and
can opt in to bounded, redacted request/response capture.

## Install

```bash
npm install @outray/tanstack-start
```

Create an OutRay token with **Send observability data**. Configure OutRay in a
server entry; no `NODE_OPTIONS` preloader or OpenTelemetry-specific environment
variables are required.

## Configure the server

Create `src/server.ts`:

```ts
import { createOutrayTanStackServerEntry } from "@outray/tanstack-start/server";

export default createOutrayTanStackServerEntry({
  apiKey: "outray_your_observability_token",
  serviceName: "my-tanstack-app",
  environment: "production",
  captureConsole: true,
  capturePayloads: {
    maxBodyBytes: 16 * 1024,
    redactedHeaders: ["x-workspace-secret"],
    redactedFields: ["accountPin"],
  },
  routeResolver: ({ pathname }) => {
    if (pathname.startsWith("/api/orders/")) return "/api/orders/:orderId";
    return null;
  },
});
```

The returned server entry also exposes structured logging methods. Exporting a
named value makes them available elsewhere in the server without a second SDK
instance:

```ts
export const outray = createOutrayTanStackServerEntry({
  apiKey: "outray_your_observability_token",
  serviceName: "my-tanstack-app",
  environment: "production",
});

export default outray;

outray.info("server started");
```

Call `outray.error("request failed", error)` from an error handler to preserve
the exception and active trace context.

For application operations that need their own child span, import
`withOutraySpan` from `@outray/tanstack-start`.

Your ordinary scripts stay unchanged:

```json
{
  "scripts": {
    "dev": "vite dev",
    "start": "node .output/server/index.mjs"
  }
}
```

Pass the token directly as shown, but do not commit a real token to source
control. Production code can supply the same `apiKey` option from OutRay
Secrets, your deployment platform, or another server-only config source.
`serviceName` and `environment` are regular code configuration.

Payload capture is disabled unless `capturePayloads` is set. Only JSON,
`application/*+json`, and URL-encoded bodies are eligible. Sensitive headers
and fields are always redacted, bodies are bounded, and request/response streams
used by handlers are never consumed.

The default route normalizer replaces UUIDs, numeric IDs, long hexadecimal
IDs, and ULIDs with `:id`. Use `routeResolver` for application-specific slugs or
to provide exact TanStack route templates. Vite internals and common static
asset paths are ignored by default.

This package instruments TanStack Start's Node/Nitro runtime. Keep the
configuration in `src/server.ts`; it does not put the OutRay token in browser
code and does not currently support edge runtimes.
