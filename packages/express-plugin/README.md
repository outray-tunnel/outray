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

### Observability

Register telemetry in code before your routes. No `NODE_OPTIONS` preloader or
OpenTelemetry environment-variable names are required:

```typescript
import express from 'express'
import outray, { registerOutrayObservability } from '@outray/express'

const app = express()

registerOutrayObservability(app, {
  apiKey: 'outray_your_observability_token',
  serviceName: 'orders-api',
  environment: 'production',
  capturePayloads: {
    maxBodyBytes: 16 * 1024,
    redactedHeaders: ['x-workspace-secret'],
    redactedFields: ['accountPin'],
  },
})

app.use(express.json())
app.post('/orders', createOrder)

// Optional development tunnel; telemetry is independent from it.
outray(app)
```

Pass the token directly as shown, but do not commit a real token to source
control. Production code can supply the same `apiKey` option from any
server-only secret provider. Request spans, logs, and metrics are initialized
by the adapter. Payload capture is optional and request streams are never
consumed; parsed bodies become available after a body parser such as
`express.json()` populates `request.body`.

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
