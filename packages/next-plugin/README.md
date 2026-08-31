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

## OpenTelemetry payload capture

`next.config` never handles runtime requests, so payload capture is exposed as
an explicit App Router route-handler wrapper. The application must already
create an active OpenTelemetry server span.

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
