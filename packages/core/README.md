# @outray/core

Core tunnel client for [Outray](https://outray.dev) - shared between the CLI and framework plugins.

This package provides the low-level WebSocket client for establishing tunnels to the Outray server. It's used internally by:

- `outray` (CLI)
- `@outray/vite` (Vite plugin)
- Other framework integrations

## Installation

```bash
npm install @outray/core
# or
pnpm add @outray/core
# or
yarn add @outray/core
```

## Usage

```ts
import { OutrayClient } from '@outray/core';

const client = new OutrayClient({
  localPort: 3000,
  
  // Optional: API key for authentication
  apiKey: process.env.OUTRAY_API_KEY,
  
  // Optional: Request a specific subdomain
  subdomain: 'my-app',
  
  // Callbacks
  onTunnelReady: (url) => {
    console.log(`Tunnel ready at: ${url}`);
  },
  
  onError: (error, code) => {
    console.error(`Error: ${error.message}`);
  },
  
  onRequest: (info) => {
    console.log(`${info.method} ${info.path} - ${info.statusCode} (${info.duration}ms)`);
  },
  
  onReconnecting: (attempt, delay) => {
    console.log(`Reconnecting in ${delay}ms (attempt ${attempt})`);
  },
});

// Start the tunnel
client.start();

// Check status
console.log('Connected:', client.isConnected());
console.log('URL:', client.getUrl());

// Stop when done
client.stop();
```

## API

### `OutrayClient`

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `localPort` | `number` | **required** | Local port to proxy requests to |
| `serverUrl` | `string` | `'wss://api.outray.dev/'` | Outray server WebSocket URL |
| `apiKey` | `string` | - | API key for authentication |
| `subdomain` | `string` | - | Subdomain to use (requires auth) |
| `customDomain` | `string` | - | Custom domain (must be configured in dashboard) |
| `protocol` | `'http' \| 'tcp' \| 'udp'` | `'http'` | Tunnel protocol type |
| `remotePort` | `number` | - | Remote port for TCP/UDP tunnels |
| `onTunnelReady` | `(url: string, port?: number) => void` | - | Called when tunnel is established |
| `onError` | `(error: Error, code?: string) => void` | - | Called on error |
| `onClose` | `(reason?: string) => void` | - | Called when tunnel closes |
| `onReconnecting` | `(attempt: number, delay: number) => void` | - | Called before reconnect |
| `onRequest` | `(info: RequestInfo) => void` | - | Called for each proxied request |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `void` | Start the tunnel connection |
| `stop()` | `void` | Stop the tunnel and cleanup |
| `getUrl()` | `string \| null` | Get the assigned tunnel URL |
| `isConnected()` | `boolean` | Check if currently connected |

### Protocol Utilities

```ts
import { encodeMessage, decodeMessage } from '@outray/core';

// Encode a message to send
const encoded = encodeMessage({ type: 'open_tunnel', apiKey: '...' });

// Decode a received message
const message = decodeMessage(rawData);
```

### Error Codes

```ts
import { ErrorCodes } from '@outray/core';

// Available error codes:
ErrorCodes.SUBDOMAIN_IN_USE
ErrorCodes.AUTH_FAILED
ErrorCodes.LIMIT_EXCEEDED
ErrorCodes.INVALID_SUBDOMAIN
ErrorCodes.CUSTOM_DOMAIN_NOT_CONFIGURED
```

## Building Framework Plugins

If you're building a framework plugin, use `@outray/core` as the foundation:

```ts
import { OutrayClient, type OutrayClientOptions } from '@outray/core';

export function myFrameworkPlugin(options: MyPluginOptions) {
  let client: OutrayClient | null = null;
  
  return {
    onServerStart(port: number) {
      client = new OutrayClient({
        localPort: port,
        apiKey: options.apiKey,
        onTunnelReady: (url) => {
          // Display URL in framework's style
        },
        onError: (error) => {
          // Handle errors appropriately
        },
      });
      
      client.start();
    },
    
    onServerStop() {
      client?.stop();
    },
  };
}
```

## License

MIT © [akinloluwami](https://github.com/akinloluwami)
