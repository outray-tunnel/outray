import type { Application, Request, Response, NextFunction } from "express";
import { OutrayClient, LocalAccessManager } from "@outray/core";
import type { OutrayPluginOptions } from "./types";
import type { Server } from "http";

const DEFAULT_SERVER_URL = "wss://api.outray.dev/";

let client: OutrayClient | null = null;
let localAccess: LocalAccessManager | null = null;

/**
 * Express middleware that automatically starts an Outray tunnel when the server starts.
 *
 * @example
 * ```ts
 * // Basic usage
 * import express from 'express'
 * import outray from '@outray/express'
 *
 * const app = express()
 *
 * // Apply middleware
 * outray(app)
 *
 * app.listen(3000, () => {
 *   console.log('Server running on port 3000')
 * })
 * ```
 *
 * @example
 * ```ts
 * // With options
 * import express from 'express'
 * import outray from '@outray/express'
 *
 * const app = express()
 *
 * outray(app, {
 *   subdomain: 'my-app',
 *   apiKey: process.env.OUTRAY_API_KEY,
 *   onTunnelReady: (url) => {
 *     console.log('Tunnel ready at:', url)
 *   }
 * })
 *
 * app.listen(3000)
 * ```
 */
export default function outray(
  app: Application,
  options: OutrayPluginOptions = {},
): void {
  const {
    enabled = process.env.OUTRAY_ENABLED !== "false",
    silent = false,
    local = false,
  } = options;

  // Only run in development
  if (process.env.NODE_ENV !== "development" || !enabled) {
    return;
  }

  // Hook into server listen
  const originalListen = app.listen.bind(app);

  app.listen = function (this: Application, ...args: any[]): Server {
    const server = originalListen(...args) as Server;

    server.once("listening", () => {
      const address = server.address();

      if (!address) {
        if (!silent) {
          console.log(
            `  \x1b[33m○\x1b[0m  Outray: Could not determine server address; tunnel will not be started`,
          );
        }
        return;
      }

      if (typeof address === "string") {
        if (!silent) {
          console.log(
            `  \x1b[33m○\x1b[0m  Outray: Server is listening on a pipe or Unix domain socket ("${address}"); tunnel only works with TCP ports`,
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
        const localSubdomain = subdomain || `express-${port}`;
        localAccess = new LocalAccessManager(port, localSubdomain);
        localAccess
          .start()
          .then((info) => {
            if (!silent) {
              console.log(`  \x1b[34m📡\x1b[0m \x1b[1mLAN:\x1b[0m`);
              if (info.httpsUrl) {
                const trustNote = info.httpsIsTrusted
                  ? ""
                  : " \x1b[33m(self-signed)\x1b[0m";
                console.log(
                  `       \x1b[36m${info.httpsUrl}\x1b[0m${trustNote}`,
                );
              }
              if (info.httpUrl) {
                console.log(`       \x1b[36m${info.httpUrl}\x1b[0m`);
              }
              if (!info.httpsUrl && !info.httpUrl) {
                console.log(
                  `       \x1b[36mhttp://${info.hostname}:${info.port}\x1b[0m`,
                );
                console.log(
                  `       \x1b[33m(Run with sudo for ports 80/443)\x1b[0m`,
                );
              }
              console.log(
                `       \x1b[2mhttp://${info.ip}:${info.port} (Android)\x1b[0m`,
              );
            }
            options.onLocalReady?.(info);
          })
          .catch(() => {
            if (!silent) {
              console.log(`  \x1b[33m○\x1b[0m  Outray: mDNS unavailable`);
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
            const colorUrl = `\x1b[36m${url}\x1b[0m`;
            console.log(
              `  \x1b[32m➜\x1b[0m  \x1b[1mTunnel:\x1b[0m  ${colorUrl}`,
            );
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
            console.log(
              `  \x1b[33m⟳\x1b[0m  Outray: Reconnecting in ${Math.round(delay / 1000)}s...`,
            );
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
    });

    // Cleanup when server closes
    server.once("close", () => {
      if (localAccess) {
        localAccess.stop();
        localAccess = null;
      }
      if (client) {
        client.stop();
        client = null;
      }
    });

    // Cleanup on process exit
    const cleanup = () => {
      if (localAccess) {
        localAccess.stop();
        localAccess = null;
      }
      if (client) {
        client.stop();
        client = null;
      }
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", cleanup);

    return server;
  };
}

// Named exports for better tree-shaking
export { outray };
export type { OutrayPluginOptions };
