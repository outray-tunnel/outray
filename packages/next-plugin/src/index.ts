import type { NextConfig } from "next";
import { OutrayClient } from "@outray/core";
import type { OutrayPluginOptions } from "./types";

const DEFAULT_SERVER_URL = "wss://api.outray.dev/";

let client: OutrayClient | null = null;
let tunnelStarted = false;

/**
 * Next.js plugin that automatically starts an Outray tunnel when the dev server starts.
 *
 * @example
 * ```ts
 * // next.config.ts
 * import withOutray from '@outray/next'
 *
 * export default withOutray({
 *   // your next config
 * })
 * ```
 *
 * @example
 * ```ts
 * // With options
 * import withOutray from '@outray/next'
 *
 * export default withOutray(
 *   {
 *     // your next config
 *   },
 *   {
 *     subdomain: 'my-app',
 *     apiKey: process.env.OUTRAY_API_KEY,
 *   }
 * )
 * ```
 */
export default function withOutray(
  nextConfig: NextConfig = {},
  options: OutrayPluginOptions = {}
): NextConfig {
  const {
    enabled = process.env.OUTRAY_ENABLED !== "false",
    silent = false,
  } = options;

  // Only run in development
  if (process.env.NODE_ENV !== "development" || !enabled) {
    return nextConfig;
  }

  // Start tunnel immediately when config is loaded (dev server startup)
  if (!tunnelStarted) {
    tunnelStarted = true;
    
    // Small delay to let the server bind to the port first
    setTimeout(() => {
      startTunnel(options, silent);
    }, 2000);
  }

  return nextConfig;
}

function startTunnel(options: OutrayPluginOptions, silent: boolean): void {
  const port = parseInt(process.env.PORT || "3000", 10);
  const apiKey = options.apiKey ?? process.env.OUTRAY_API_KEY;
  const subdomain = options.subdomain ?? process.env.OUTRAY_SUBDOMAIN;
  const serverUrl =
    options.serverUrl ??
    process.env.OUTRAY_SERVER_URL ??
    DEFAULT_SERVER_URL;

  client = new OutrayClient({
    localPort: port,
    serverUrl,
    apiKey,
    subdomain,
    customDomain: options.customDomain,
    shadow: options.shadow,
    onTunnelReady: (url) => {
      if (!silent) {
        const colorUrl = `\x1b[36m${url}\x1b[0m`;
        console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mTunnel:\x1b[0m  ${colorUrl}`);
      }
      options.onTunnelReady?.(url);
    },
    onError: (error) => {
      if (!silent) {
        console.error(`  \x1b[31m✗\x1b[0m  Outray: ${error.message}`);
      }
      options.onError?.(error);
    },
    onReconnecting: (attempt, delay) => {
      if (!silent) {
        console.log(`  \x1b[33m⟳\x1b[0m  Outray: Reconnecting in ${Math.round(delay / 1000)}s...`);
      }
      options.onReconnecting?.();
    },
    onClose: () => {
      if (!silent) {
        console.log(`  \x1b[33m○\x1b[0m  Outray: Tunnel closed`);
      }
      options.onClose?.();
    },
  });

  client.start();

  // Cleanup on process exit
  const cleanup = () => {
    if (client) {
      client.stop();
      client = null;
    }
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", cleanup);
}

// Named exports for better tree-shaking
export { withOutray };
export type { OutrayPluginOptions };
