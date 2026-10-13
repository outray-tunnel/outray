# @outray/next

Next.js integration for Outray tunnels and opt-in OpenTelemetry request capture.

## Installation

```bash
npm install @outray/next
```

## Development tunnel

```typescript
// next.config.ts
import withOutray from "@outray/next";

export default withOutray({});
```

## Observability

Next.js provides a server-side instrumentation hook. Configure OutRay there;
no `NODE_OPTIONS` preloader or OpenTelemetry environment-variable names are
required:

```typescript
// instrumentation.ts
import { registerOutrayObservability } from "@outray/next/observability";

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const telemetry = registerOutrayObservability({
    apiKey: "outray_your_observability_token",
    serviceName: "storefront",
    environment: "production",
    captureConsole: true,
  });

  telemetry.info("Next.js observability started");
}
```

Pass the token directly as shown, but do not commit a real token to source
control. Production code can supply the same `apiKey` option from any
server-only secret provider.

Wrap App Router route handlers with `withOutrayRequest` to record route-aware
request spans and the same `http.server.request.count`,
`http.server.request.duration`, and `http.server.active_requests` metrics as
the other OutRay framework SDKs:

```typescript
// app/api/orders/route.ts
import { withOutrayRequest } from "@outray/next";

export const POST = withOutrayRequest(
  async (request: Request) => {
    const order = await request.json();
    return Response.json({ id: await createOrder(order) });
  },
  {
    routeResolver: () => "/api/orders",
    capturePayloads: {
      maxBodyBytes: 16 * 1024,
      redactedHeaders: ["x-workspace-secret"],
      redactedFields: ["accountPin"],
    },
  },
);
```

Obvious UUID, numeric, long hexadecimal, and ULID path segments are normalized
to `:id` automatically. Use `routeResolver` for exact templates and application
slugs. Payload capture remains disabled unless `capturePayloads` is supplied.
The existing `withOutrayPayloadCapture` export remains as a compatibility
shortcut that enables capture through the same request instrumentation.

Capture clones rather than consumes or replaces the handler's Request and
Response, and capture failures never change handler errors or responses. With
no recording span it does not clone payloads.

Only JSON, `application/*+json`, and URL-encoded form bodies are eligible.
Authorization, cookies, tokens, passwords, secrets, and API/private keys are
redacted. Bodies default to 16 KiB (hard limit 64 KiB) and serialized headers
default to 8 KiB (hard limit 32 KiB). Multipart, text, XML, binary, compressed,
and streaming bodies are not captured.

Pages Router handlers are not currently supported by this wrapper.

### Per-request capture policy

`withOutrayRequest` accepts the shared core capture policy through
`shouldCapturePayloads`. Its callback receives `{ request, pathname, method }`
and runs once before any request/response cloning. Capture remains disabled
when its static setting is absent, the callback returns anything other than
`true`, or the callback throws. These requests still produce request spans and
HTTP metrics; the handler receives the original objects and errors propagate
unchanged.

```ts
export const POST = withOutrayRequest(handler, {
  capturePayloads: true,
  shouldCapturePayloads: ({ pathname }) => !pathname.startsWith("/api/secrets/"),
  recordExceptions: false,
  ignoreDefaultPaths: false,
});
```

The compatibility shortcut accepts the same request policy as an optional
third argument: `withOutrayPayloadCapture(handler, captureOptions, policy)`.
Existing two-argument calls behave unchanged. `ignoreDefaultPaths: false`
includes framework assets, favicon, and robots requests; an explicit `ignore`
predicate still skips telemetry. With `recordExceptions: false`, failures record
generic HTTP 500/error status without exception details or error-name metric
attributes. These controls do not suppress application logs or sanitize custom
route names. Configure a separate server-side log policy if handlers can log
private content.
The raw pathname remains `url.path` request metadata even when `routeResolver`
sets a sanitized `http.route`. Payload gating is not a blanket privacy filter;
keep secret values out of URLs and use a separate metadata policy when path
values also need suppression.

Use `outray` and `withOutraySpan` from `@outray/next/observability` for logging
and application child spans:

```ts
import { outray, withOutraySpan } from "@outray/next/observability";

outray.info("payment accepted", { orderId });
await withOutraySpan("charge card", () => chargeCard(orderId));
```

## License

MIT
