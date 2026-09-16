# @outray/next

Next.js integration for Outray tunnels and opt-in OpenTelemetry request capture.

## Installation

```bash
npm install @outray/next
```

## Development tunnel

```typescript
// next.config.ts
import withOutray from '@outray/next'

export default withOutray({})
```

## Observability

Next.js provides a server-side instrumentation hook. Configure OutRay there;
no `NODE_OPTIONS` preloader or OpenTelemetry environment-variable names are
required:

```typescript
// instrumentation.ts
import { registerOutrayObservability } from '@outray/next/observability'

export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  registerOutrayObservability({
    apiKey: 'outray_your_observability_token',
    serviceName: 'storefront',
    environment: 'production',
  })
}
```

Pass the token directly as shown, but do not commit a real token to source
control. Production code can supply the same `apiKey` option from any
server-only secret provider. For optional bounded request/response capture,
wrap App Router route handlers:

```typescript
// app/api/orders/route.ts
import { withOutrayPayloadCapture } from '@outray/next'

export const POST = withOutrayPayloadCapture(
  async (request: Request) => {
    const order = await request.json()
    return Response.json({ id: await createOrder(order) })
  },
  {
    maxBodyBytes: 16 * 1024,
    redactedHeaders: ['x-workspace-secret'],
    redactedFields: ['accountPin'],
  },
)
```

Using the wrapper is the opt-in; capture is never enabled by the config plugin.
It clones rather than consumes or replaces the handler's Request and Response,
and capture failures never change handler errors or responses. With no active
span it calls the handler directly without cloning anything.

Only JSON, `application/*+json`, and URL-encoded form bodies are eligible.
Authorization, cookies, tokens, passwords, secrets, and API/private keys are
redacted. Bodies default to 16 KiB (hard limit 64 KiB) and serialized headers
default to 8 KiB (hard limit 32 KiB). Multipart, text, XML, binary, compressed,
and streaming bodies are not captured.

Pages Router handlers are not currently supported by this wrapper.

## License

MIT
