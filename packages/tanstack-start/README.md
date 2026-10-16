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

Use ES module `import` statements in TanStack Start's Vite/Nitro server build,
as shown below. The bundler resolves the ESM entrypoints; loading this adapter
directly with `require()` can fail because its TanStack dependencies are ESM-only.

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

To capture auth failures without dropping the endpoint, extend redaction rather
than adding a route exclusion:

```ts
capturePayloads: {
  redactedFields: ["value", "values", "envText", "requestBody", "responseBody"],
  redactedRequestFields: ["code", "state", "nonce", "challenge"],
},
captureConsole: true,
redactedLogFields: ["value", "values", "envText", "body"],
```

`redactedRequestFields` extends the shared core policy only for request bodies;
response diagnostic fields such as `code: "INVALID_CREDENTIALS"` remain visible.
Credential headers and embedded auth URLs are redacted by default. These controls
do not modify the application's original headers, bodies or console arguments.

The default route normalizer replaces UUIDs, numeric IDs, long hexadecimal
IDs, and ULIDs with `:id`. Use `routeResolver` for application-specific slugs or
to provide exact TanStack route templates. Vite internals and common static
asset paths are ignored by default.

## Track sensitive endpoints without capturing their content

Use `shouldCapturePayloads` to turn enabled capture off for particular requests.
This option inherits the shared `HttpPayloadCapturePolicy` from `@outray/core`,
so a `{ pathname, method }` predicate can be reused across framework adapters.
TanStack additionally provides the original `request` in the callback context.
Those requests still record their normalized route, method, status, duration,
and HTTP metrics; their request and response streams are not cloned or read by
capture. The predicate is evaluated once per instrumented request. Returning
anything other than `true`, or throwing, disables capture for that request
without changing its application response.

```ts
export default createOutrayTanStackServerEntry({
  apiKey: process.env.OUTRAY_API_KEY,
  serviceName: "my-tanstack-app",
  capturePayloads: true,
  shouldCapturePayloads: ({ pathname }) => !pathname.startsWith("/api/secrets/"),
  recordExceptions: false,
  ignoreDefaultPaths: false,
});
```

`recordExceptions: false` omits exception messages, stack traces, and
exception-derived metric error names. A thrown handler error still records a
generic HTTP 500 and error status, then propagates unchanged. This setting does
not control application logs: keep `captureConsole` disabled, or use a
request-scoped `shouldCaptureLog` policy, when sensitive requests may log private
content. Use `routeResolver` to replace sensitive path identifiers with explicit
templates; payload gating does not sanitize custom route names.

Set `ignoreDefaultPaths: false` to also instrument framework assets,
`/favicon.ico`, and `/robots.txt`. It defaults to `true` for compatibility.
Your explicit `ignore` predicate still skips telemetry even when default
exclusions are disabled. `shouldCapturePayloads` never enables capture when
`capturePayloads` is absent or `false`.

This package instruments TanStack Start's Node/Nitro runtime. Keep the
configuration in `src/server.ts`; it does not put the OutRay token in browser
code and does not currently support edge runtimes.
