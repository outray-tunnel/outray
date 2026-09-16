# @outray/nest

NestJS integration for [Outray](https://outray.dev), the open-source tunneling solution. Automatically expose your local NestJS server to the internet during development.

## Installation

```bash
npm install @outray/nest
# or
pnpm add @outray/nest
# or
yarn add @outray/nest
```

## Usage

Import the `outray` function and call it in your `main.ts` file after your application starts listening.

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { outray } from '@outray/nest';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Start the server
  await app.listen(3000);

  // Start the tunnel in development
  if (process.env.NODE_ENV !== 'production') {
    await outray(app);
  }
}
bootstrap();
```

### Observability

Register telemetry in code before `app.listen()`. No `NODE_OPTIONS` preloader
or OpenTelemetry environment-variable names are required. Request tracing and
payload capture currently support Nest's Express adapter:

```typescript
import { NestFactory } from '@nestjs/core';
import {
  outray,
  registerOutrayObservability,
} from '@outray/nest';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  registerOutrayObservability(app, {
    apiKey: 'outray_your_observability_token',
    serviceName: 'orders-api',
    environment: 'production',
    capturePayloads: {
      maxBodyBytes: 16 * 1024,
      redactedHeaders: ['x-workspace-secret'],
      redactedFields: ['accountPin'],
    },
  });

  await app.listen(3000);
  await outray(app); // The development tunnel remains a separate concern.
}
```

Pass the token directly as shown, but do not commit a real token to source
control. Production code can supply the same `apiKey` option from any
server-only secret provider. Telemetry remains active in production when the
development tunnel is disabled. Late registration and non-Express request
instrumentation are skipped with a warning instead of affecting the
application.

Only JSON, `application/*+json`, and URL-encoded form bodies are eligible.
Authorization, cookies, tokens, passwords, secrets, and API/private keys are
redacted. Bodies default to 16 KiB (hard limit 64 KiB) and serialized headers
default to 8 KiB (hard limit 32 KiB). Multipart, text, XML, binary, compressed,
and streaming bodies are not captured.

## Configuration

You can pass options to the `outray` function:

```typescript
await outray(app, {
  // Optional: Explicitly specify port (auto-detected otherwise)
  port: 3000,
  
  // Optional: Request a specific subdomain
  subdomain: 'my-cool-app',
  
  // Optional: Use a custom domain
  customDomain: 'api.example.com',
  
  // Optional: Suppress console output
  silent: false,
});
```

### Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | Auto-detected | The local port your NestJS app is running on. |
| `subdomain` | `string` | Random | Request a specific subdomain. |
| `apiKey` | `string` | `process.env.OUTRAY_API_KEY` | Your Outray API key. |
| `enabled` | `boolean` | `true` (in dev) | Whether to enable the tunnel. |
| `silent` | `boolean` | `false` | specific to Console logs. |
| `capturePayloads` | `boolean \| HttpPayloadCaptureOptions` | `false` | Register opt-in payload capture before the app is initialized. Prefer `registerOutrayPayloadCapture`. |
| `onTunnelReady` | `(url: string) => void` | - | Callback when tunnel is ready. |

## License

MIT
