import type { Plugin, ViteDevServer } from "vite";
import { OutRayClient } from "./client";
import type { OutrayPluginOptions } from "./types";

const DEFAULT_SERVER_URL = "wss://api.outray.dev/";

/**
 * Vite plugin that automatically starts an Outray tunnel when the dev server starts.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import outray from '@outray/vite'
 *
 * export default defineConfig({
 *   plugins: [outray()]
 * })
 * ```
 *
 * @example
 * ```ts
 * // With options
 * import { defineConfig } from 'vite'
 * import outray from '@outray/vite'
 *
 * export default defineConfig({
 *   plugins: [
 *     outray({
 *       subdomain: 'my-app',
 *       apiKey: process.env.OUTRAY_API_KEY,
 *     })
 *   ]
 * })
 * ```
 */
export default function outrayPlugin(
  options: OutrayPluginOptions = {}
): Plugin {
  let client: OutRayClient | null = null;
  let tunnelUrl: string | null = null;

  return {
    name: "vite-plugin-outray",

    // Only run in dev mode
    apply: "serve",

    configureServer(server: ViteDevServer) {
      const {
        enabled = process.env.OUTRAY_ENABLED !== "false",
        silent = false,
      } = options;

      if (!enabled) return;

      if (!server.httpServer) {
        if (!silent) {
          server.config.logger.info(
            `  \x1b[33m○\x1b[0m  Outray: httpServer is not available; tunnel will not be started`
          );
        }
        return;
      }

      server.httpServer.once("listening", () => {
        const address = server.httpServer?.address();
        
        if (!address) {
          if (!silent) {
            server.config.logger.info(
              `  \x1b[33m○\x1b[0m  Outray: Could not determine dev server address; tunnel will not be started`
            );
          }
          return;
        }
        
        if (typeof address === "string") {
          if (!silent) {
            server.config.logger.info(
              `  \x1b[33m○\x1b[0m  Outray: Dev server is listening on a pipe or Unix domain socket ("${address}"); tunnel only works with TCP ports`
            );
          }
          return;
        }

        const port = address.port;
        const apiKey = options.apiKey ?? process.env.OUTRAY_API_KEY;
        const subdomain = options.subdomain ?? process.env.OUTRAY_SUBDOMAIN;
        const serverUrl =
          options.serverUrl ??
          process.env.OUTRAY_SERVER_URL ??
          DEFAULT_SERVER_URL;

        client = new OutRayClient({
          localPort: port,
          serverUrl,
          apiKey,
          subdomain,
          customDomain: options.customDomain,
          silent,
          onTunnelReady: (url) => {
            tunnelUrl = url;

            if (!silent) {
              // Print tunnel URL in Vite's style
              const colorUrl = `\x1b[36m${url}\x1b[0m`; // cyan color
              server.config.logger.info(`  \x1b[32m➜\x1b[0m  \x1b[1mTunnel:\x1b[0m  ${colorUrl}`);
            }

            options.onTunnelReady?.(url);
          },
          onError: (error) => {
            if (!silent) {
              server.config.logger.error(`  \x1b[31m✗\x1b[0m  Outray: ${error.message}`);
            }
            options.onError?.(error);
          },
          onReconnecting: () => {
            if (!silent) {
              server.config.logger.info(`  \x1b[33m⟳\x1b[0m  Outray: Reconnecting...`);
            }
            options.onReconnecting?.();
          },
          onClose: () => {
            if (!silent) {
              server.config.logger.info(`  \x1b[33m○\x1b[0m  Outray: Tunnel closed`);
            }
            options.onClose?.();
          },
        });

        client.start();
      });

      // Cleanup when server closes
      server.httpServer.once("close", () => {
        if (client) {
          client.stop();
          client = null;
        }
      });
    },
  };
}

// Named exports for better tree-shaking.
// Recommended usage (default export):
//   import outray from '@outray/vite'
// Optional named import (equivalent):
//   import { outray } from '@outray/vite'
export { outrayPlugin as outray };
export { OutRayClient };
export type { OutrayPluginOptions };
