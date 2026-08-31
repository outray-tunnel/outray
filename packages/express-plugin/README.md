# @outray/express

Express middleware to automatically expose your development server to the internet via [Outray](https://outray.dev) tunnel.

## Installation

```bash
npm install @outray/express
```

## Usage

### Basic Usage

```typescript
import express from 'express'
import outray from '@outray/express'

const app = express()

// Apply Outray middleware
outray(app)

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(3000, () => {
  console.log('Server running on port 3000')
})
```

When you start your server in development mode, you'll see:

```
Server running on port 3000
  ➜  Tunnel:  https://quick-tiger.outray.app
```

### With Options

```typescript
import express from 'express'
import outray from '@outray/express'

const app = express()

outray(app, {
  subdomain: 'my-app',
  apiKey: process.env.OUTRAY_API_KEY,
  onTunnelReady: (url) => {
    console.log('Tunnel ready at:', url)
  }
})

app.listen(3000)
```

### OpenTelemetry payload capture

Payload capture is off by default. If your app already creates OpenTelemetry
HTTP server spans, you can opt in by registering Outray before your routes:

```typescript
import express from 'express'
import outray from '@outray/express'

const app = express()

outray(app, {
  capturePayloads: {
    maxBodyBytes: 16 * 1024,
    redactedHeaders: ['x-workspace-secret'],
    redactedFields: ['accountPin'],
  },
})

app.use(express.json())
app.post('/orders', createOrder)
```

This setting is independent of the development-only tunnel, so explicit
capture still works in production when `enabled` is false. It is a safe no-op
when there is no active OpenTelemetry span. Request streams are never consumed;
request bodies are available when a body parser such as `express.json()` has
populated `request.body`.

Only JSON, `application/*+json`, and URL-encoded form bodies are eligible.
Authorization, cookies, tokens, passwords, secrets, and API/private keys are
redacted. Bodies default to 16 KiB (hard limit 64 KiB) and serialized headers
default to 8 KiB (hard limit 32 KiB). Multipart, text, XML, binary, compressed,
and streaming bodies are not captured.

## Options

```typescript
interface OutrayPluginOptions {
  /** Subdomain to use (requires authentication) */
  subdomain?: string;
  
  /** Custom domain (must be configured in dashboard) */
  customDomain?: string;
  
  /** API key for authentication */
  apiKey?: string;
  
  /** Outray server URL */
  serverUrl?: string;
  
  /** Enable/disable tunnel (default: true in development) */
  enabled?: boolean;
  
  /** Suppress logs */
  silent?: boolean;

  /** Opt-in OpenTelemetry payload capture (default: false) */
  capturePayloads?: boolean | HttpPayloadCaptureOptions;
  
  /** Callback when tunnel is ready */
  onTunnelReady?: (url: string) => void;
  
  /** Callback on error */
  onError?: (error: Error) => void;
  
  /** Callback on reconnecting */
  onReconnecting?: () => void;
  
  /** Callback on close */
  onClose?: () => void;
}
```

## Environment Variables

- `OUTRAY_API_KEY` - Your Outray API key
- `OUTRAY_SUBDOMAIN` - Custom subdomain
- `OUTRAY_ENABLED` - Set to `"false"` to disable
- `OUTRAY_SERVER_URL` - Custom server URL (default: `wss://api.outray.dev/`)
