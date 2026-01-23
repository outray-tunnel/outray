# @outray/vite

Vite plugin to automatically expose your local dev server to the internet via [Outray](https://outray.dev) tunnel.

## Installation

```bash
npm install @outray/vite
# or
pnpm add @outray/vite
# or
yarn add @outray/vite
```

## Usage

### Basic Usage

Add the plugin to your `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import outray from '@outray/vite'

export default defineConfig({
  plugins: [outray()]
})
```

When you start your dev server, you'll see the tunnel URL in the console:

```
  VITE v6.0.0  ready in 234 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.100:5173/
  ➜  Tunnel:  https://abc123.outray.dev/
```

### With Options

```ts
import { defineConfig } from 'vite'
import outray from '@outray/vite'

export default defineConfig({
  plugins: [
    outray({
      // Use a specific subdomain (requires authentication)
      subdomain: 'my-app',

      // API key for authentication
      apiKey: process.env.OUTRAY_API_KEY,

      // Use a custom domain (must be configured in dashboard first)
      customDomain: 'dev.mycompany.com',

      // Disable tunnel in certain environments
      enabled: process.env.NODE_ENV !== 'test',

      // Suppress tunnel logs
      silent: false,

      // Callback when tunnel is ready
      onTunnelReady: (url) => {
        console.log(`Share this URL: ${url}`)
      },

      // Callback on tunnel error
      onError: (error) => {
        console.error('Tunnel error:', error)
      }
    })
  ]
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `subdomain` | `string` | - | Subdomain for the tunnel URL (requires auth) |
| `customDomain` | `string` | - | Custom domain (must be configured in dashboard) |
| `apiKey` | `string` | `process.env.OUTRAY_API_KEY` | API key for authentication |
| `serverUrl` | `string` | `'wss://api.outray.dev/'` | Outray server WebSocket URL |
| `enabled` | `boolean` | `process.env.OUTRAY_ENABLED !== "false"` | Enable or disable the tunnel (enabled by default unless OUTRAY_ENABLED is set to "false") |
| `silent` | `boolean` | `false` | Suppress tunnel status logs |
| `onTunnelReady` | `(url: string) => void` | - | Callback when tunnel is established |
| `onError` | `(error: Error) => void` | - | Callback when tunnel encounters an error |
| `onClose` | `() => void` | - | Callback when tunnel connection is closed |
| `onReconnecting` | `() => void` | - | Callback when tunnel is attempting to reconnect |

## Environment Variables

The plugin also reads these environment variables:

| Variable | Description |
|----------|-------------|
| `OUTRAY_API_KEY` | API key for authentication |
| `OUTRAY_SUBDOMAIN` | Default subdomain to use |
| `OUTRAY_SERVER_URL` | Custom server URL (for self-hosted) |
| `OUTRAY_ENABLED` | Set to `false` to disable tunnel |

## Features

- **Zero-config** - Works out of the box with sensible defaults
- **Auto-reconnect** - Automatically reconnects if connection drops
- **Graceful cleanup** - Tunnel closes when dev server stops
- **Vite-styled output** - Tunnel URL displays alongside Vite's local URLs
- **Environment variables** - Configure via env vars for different environments

## Security Considerations

Outray works by forwarding HTTP(S) requests from the internet directly to your local development server.
This is powerful but comes with important security implications:

- **Do not expose sensitive services**: Avoid tunneling databases, admin panels, internal dashboards, or any service
  that is not intended to be publicly reachable.
- **Be careful with dev/debug endpoints**: Many dev servers expose debug tooling, stack traces, hot-module reload,
  or other endpoints that should not be accessible to untrusted users.
- **Use authentication where appropriate**: If your application handles real or sensitive data, ensure that it
  enforces proper authentication and authorization even when accessed via the tunnel.
- **Treat the tunnel URL as public**: Anyone with the tunnel URL can send requests to your local server
  (subject to any authentication you implement in your app).
- **Use only in trusted environments**: This plugin is intended for development use. Do not rely on it as a
  security boundary or as a replacement for production-grade network controls.

When in doubt, only expose the minimal service you need for testing or sharing, and disable the tunnel
(`enabled: false` or `OUTRAY_ENABLED=false`) when it is not actively in use.