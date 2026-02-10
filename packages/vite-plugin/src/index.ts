import type { Plugin, ViteDevServer } from "vite";
import { OutrayClient, LocalAccessManager } from "@outray/core";
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
  options: OutrayPluginOptions = {},
): Plugin {
  let client: OutrayClient | null = null;
  let localAccess: LocalAccessManager | null = null;

  return {
    name: "vite-plugin-outray",

    // Only run in dev mode
    apply: "serve",

    configureServer(server: ViteDevServer) {
      const {
        enabled = process.env.OUTRAY_ENABLED !== "false",
        silent = false,
        local = false,
      } = options;

      if (!enabled) return;

      if (!server.httpServer) {
        if (!silent) {
          server.config.logger.info(
            `  \x1b[33m○\x1b[0m  Outray: httpServer is not available; tunnel will not be started`,
          );
        }
        return;
      }

      server.httpServer.once("listening", () => {
        const address = server.httpServer?.address();

        if (!address) {
          if (!silent) {
            server.config.logger.info(
              `  \x1b[33m○\x1b[0m  Outray: Could not determine dev server address; tunnel will not be started`,
            );
          }
          return;
        }

        if (typeof address === "string") {
          if (!silent) {
            server.config.logger.info(
              `  \x1b[33m○\x1b[0m  Outray: Dev server is listening on a pipe or Unix domain socket ("${address}"); tunnel only works with TCP ports`,
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

        // Start local access if enabled
        if (local) {
          const localSubdomain = subdomain || `vite-${port}`;
          localAccess = new LocalAccessManager(port, localSubdomain);
          localAccess
            .start()
            .then((info) => {
              if (!silent) {
                server.config.logger.info(
                  `  \x1b[34m📡\x1b[0m \x1b[1mLAN:\x1b[0m`,
                );
                if (info.httpsUrl) {
                  const trustNote = info.httpsIsTrusted
                    ? ""
                    : " \x1b[33m(self-signed)\x1b[0m";
                  server.config.logger.info(
                    `       \x1b[36m${info.httpsUrl}\x1b[0m${trustNote}`,
                  );
                }
                if (info.httpUrl) {
                  server.config.logger.info(
                    `       \x1b[36m${info.httpUrl}\x1b[0m`,
                  );
                }
                if (!info.httpsUrl && !info.httpUrl) {
                  server.config.logger.info(
                    `       \x1b[36mhttp://${info.hostname}:${info.port}\x1b[0m`,
                  );
                  server.config.logger.info(
                    `       \x1b[33m(Run with sudo for ports 80/443)\x1b[0m`,
                  );
                }
                server.config.logger.info(
                  `       \x1b[2mhttp://${info.ip}:${info.port} (Android)\x1b[0m`,
                );
              }
              options.onLocalReady?.(info);
            })
            .catch(() => {
              if (!silent) {
                server.config.logger.warn(
                  `  \x1b[33m○\x1b[0m  Outray: mDNS unavailable`,
                );
              }
            });
        }

        client = new OutrayClient({
          localPort: port,
          serverUrl,
          apiKey,
          subdomain,
          customDomain: options.customDomain,
          onTunnelReady: (url) => {
            if (!silent) {
              // Print tunnel URL in Vite's style
              const colorUrl = `\x1b[36m${url}\x1b[0m`; // cyan color
              server.config.logger.info(
                `  \x1b[32m➜\x1b[0m  \x1b[1mTunnel:\x1b[0m  ${colorUrl}`,
              );
            }

            options.onTunnelReady?.(url);
          },
          onError: (error) => {
            if (!silent) {
              server.config.logger.error(
                `  \x1b[31m✗\x1b[0m  Outray: ${error.message}`,
              );
            }
            options.onError?.(error);
          },
          onReconnecting: (attempt, delay) => {
            if (!silent) {
              server.config.logger.info(
                `  \x1b[33m⟳\x1b[0m  Outray: Reconnecting in ${Math.round(delay / 1000)}s...`,
              );
            }
            options.onReconnecting?.();
          },
          onClose: () => {
            if (!silent) {
              server.config.logger.info(
                `  \x1b[33m○\x1b[0m  Outray: Tunnel closed`,
              );
            }
            options.onClose?.();
          },
        });

        client.start();
      });

      // Cleanup when server closes
      server.httpServer.once("close", () => {
        if (localAccess) {
          localAccess.stop();
          localAccess = null;
        }
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
export type { OutrayPluginOptions };
