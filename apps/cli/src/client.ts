import WebSocket from "ws";
import chalk from "chalk";
import prompts from "prompts";
import { encodeMessage, decodeMessage } from "@outray/core";
import type {
  ShadowDiffResult,
  ShadowOptions,
  ShadowResponseSummary,
  TunnelDataMessage,
  TunnelResponseMessage,
} from "@outray/core";
import http from "http";
import https from "https";
import { createHash, randomUUID } from "crypto";

const DEFAULT_SHADOW_TIMEOUT_MS = 4000;
const DEFAULT_SHADOW_MAX_BODY_BYTES = 256 * 1024;

export class OutRayClient {
  private ws: WebSocket | null = null;
  private localPort: number;
  private serverUrl: string;
  private apiKey?: string;
  private subdomain?: string;
  private customDomain?: string;
  private requestedSubdomain?: string;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private shouldReconnect = true;
  private assignedUrl: string | null = null;
  private subdomainConflictHandled = false;
  private forceTakeover = false;
  private reconnectAttempts = 0;
  private lastPongReceived = Date.now();
  private noLog: boolean;
  private shadow?: ShadowOptions;
  private readonly PING_INTERVAL_MS = 25000; // 25 seconds
  private readonly PONG_TIMEOUT_MS = 10000; // 10 seconds to wait for pong

  constructor(
    localPort: number,
    serverUrl: string = "wss://api.outray.dev/",
    apiKey?: string,
    subdomain?: string,
    customDomain?: string,
    noLog: boolean = false,
    shadow?: ShadowOptions,
  ) {
    this.localPort = localPort;
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
    this.subdomain = subdomain;
    this.customDomain = customDomain;
    this.requestedSubdomain = subdomain;
    this.noLog = noLog;
    this.shadow = shadow;
  }

  public start(): void {
    this.connect();
  }

  public stop(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopPing();
    this.stopPongTimeout();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private stopPongTimeout(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private connect(): void {
    console.log(chalk.cyan("Connecting to OutRay..."));

    this.ws = new WebSocket(this.serverUrl);

    this.ws.on("open", () => this.handleOpen());
    this.ws.on("message", (data) => this.handleMessage(data.toString()));
    this.ws.on("close", (code, reason) => this.handleClose(code, reason));
    this.ws.on("error", (error) => {
      console.log(chalk.red(`WebSocket error: ${error.message}`));
    });
    this.ws.on("pong", () => {
      // Received pong, connection is alive
      this.lastPongReceived = Date.now();
      this.stopPongTimeout();
    });
  }

  private handleOpen(): void {
    console.log(chalk.green(`Linked to your local port ${this.localPort}`));
    this.startPing();

    const handshake = encodeMessage({
      type: "open_tunnel",
      apiKey: this.apiKey,
      subdomain: this.subdomain,
      customDomain: this.customDomain,
      forceTakeover: this.forceTakeover,
    });
    this.ws?.send(handshake);
  }

  private handleMessage(data: string): void {
    try {
      const message = decodeMessage(data);

      if (message.type === "tunnel_opened") {
        this.assignedUrl = message.url;
        const derivedSubdomain = this.extractSubdomain(message.url);
        if (derivedSubdomain) {
          this.subdomain = derivedSubdomain;
        }
        // Reset forceTakeover flag after successful connection
        // Keep subdomainConflictHandled to detect takeovers
        this.forceTakeover = false;
        this.reconnectAttempts = 0;
        console.log(chalk.magenta(`✨ Tunnel ready: ${message.url}`));
        console.log(
          chalk.yellow("Keep this running to keep your tunnel active."),
        );
      } else if (message.type === "error") {
        if (message.code === "SUBDOMAIN_IN_USE") {
          if (this.assignedUrl) {
            // If we're reconnecting and the subdomain is in use, it's likely our own
            // zombie connection from the drop. Try to force takeover once.
            if (!this.forceTakeover) {
              console.log(
                chalk.dim(
                  "Subdomain in use during reconnection, attempting takeover...",
                ),
              );
              this.forceTakeover = true;
              return;
            }

            // We had a successful connection before, but now subdomain is taken
            // This means we were taken over by another tunnel
            console.log(
              chalk.yellow(
                `\nYour tunnel was taken over by another connection.`,
              ),
            );
            console.log(
              chalk.dim(
                `   Subdomain "${this.subdomain}" is now in use elsewhere.`,
              ),
            );
            this.shouldReconnect = false;
            this.stop();
            process.exit(0);
          } else if (!this.subdomainConflictHandled) {
            // First time encountering this subdomain conflict
            this.subdomainConflictHandled = true;
            this.shouldReconnect = false;
            this.handleSubdomainConflict();
          } else {
            // Subdomain conflict but we already handled it, just log
            console.log(chalk.red(`❌ Error: ${message.message}`));
          }
        } else if (message.code === "AUTH_FAILED") {
          console.log(chalk.red(`❌ Error: ${message.message}`));
          this.shouldReconnect = false;
          this.stop();
          process.exit(1);
        } else if (message.code === "LIMIT_EXCEEDED") {
          console.log(chalk.red(`❌ Error: ${message.message}`));
          this.shouldReconnect = false;
          this.stop();
          process.exit(1);
        } else {
          console.log(chalk.red(`❌ Error: ${message.message}`));
        }
      } else if (message.type === "request") {
        this.handleTunnelData(message);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Failed to parse message: ${error}`));
    }
  }

  private handleTunnelData(message: TunnelDataMessage): void {
    const startTime = Date.now();
    const requestId = randomUUID();
    const reqOptions = {
      hostname: "localhost",
      port: this.localPort,
      path: message.path,
      method: message.method,
      headers: message.headers,
    };

    const req = http.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];

      res.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
      });

      res.on("end", () => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode || 200;
        const statusColor =
          statusCode >= 500
            ? chalk.red
            : statusCode >= 400
              ? chalk.yellow
              : statusCode >= 300
                ? chalk.cyan
                : chalk.green;

        if (!this.noLog) {
          console.log(
            chalk.dim("←") +
              ` ${chalk.bold(message.method)} ${message.path} ${statusColor(statusCode)} ${chalk.dim(`${duration}ms`)}`,
          );
        }

        const bodyBuffer = Buffer.concat(chunks);
        const bodyBase64 =
          bodyBuffer.length > 0 ? bodyBuffer.toString("base64") : undefined;

        const response: TunnelResponseMessage = {
          type: "response",
          requestId: message.requestId,
          statusCode: statusCode,
          headers: res.headers as any,
          body: bodyBase64,
        };

        this.ws?.send(encodeMessage(response));

        const shadowOptions = this.shadow;
        if (
          shadowOptions &&
          shadowOptions.enabled !== false &&
          this.shouldSample(shadowOptions)
        ) {
          void this.runShadowDiff({
            requestId,
            method: message.method,
            path: message.path,
            headers: message.headers,
            bodyBuffer,
            primary: this.buildResponseSummary(
              statusCode,
              res.headers,
              bodyBuffer,
              duration,
            ),
            options: shadowOptions,
          });
        }
      });
    });

    req.on("error", (err) => {
      const duration = Date.now() - startTime;
      if (!this.noLog) {
        console.log(
          chalk.dim("←") +
            ` ${chalk.bold(message.method)} ${message.path} ${chalk.red("502")} ${chalk.dim(`${duration}ms`)} ${chalk.red(err.message)}`,
        );
      }

      const errorResponse: TunnelResponseMessage = {
        type: "response",
        requestId: message.requestId,
        statusCode: 502,
        headers: { "content-type": "text/plain" },
        body: Buffer.from(`Bad Gateway: ${err.message}`).toString("base64"),
      };

      this.ws?.send(encodeMessage(errorResponse));
    });

    if (message.body) {
      const bodyBuffer = Buffer.from(message.body, "base64");
      req.write(bodyBuffer);
    }

    req.end();
  }

  private extractSubdomain(url: string): string | null {
    try {
      const hostname = new URL(url).hostname;
      const [subdomain] = hostname.split(".");
      return subdomain || null;
    } catch (error) {
      console.warn(
        chalk.yellow(
          `Unable to determine tunnel subdomain from url '${url}': ${error}`,
        ),
      );
      return null;
    }
  }

  private shouldSample(options: ShadowOptions): boolean {
    const rate = options.sampleRate ?? 1;
    if (rate >= 1) return true;
    if (rate <= 0) return false;
    return Math.random() < rate;
  }

  private buildResponseSummary(
    statusCode: number,
    headers: http.IncomingHttpHeaders,
    bodyBuffer: Buffer,
    durationMs: number,
  ): ShadowResponseSummary {
    const maxBytes =
      this.shadow?.maxBodyBytes ?? DEFAULT_SHADOW_MAX_BODY_BYTES;
    const bodySlice = bodyBuffer.subarray(0, maxBytes);
    const truncated = bodyBuffer.length > bodySlice.length;
    const bodyHash = bodySlice.length
      ? createHash("sha256").update(bodySlice).digest("hex")
      : undefined;
    return {
      statusCode,
      headers: headers as Record<string, string | string[]>,
      bodyHash,
      bodyBytes: bodyBuffer.length,
      durationMs,
      truncated,
    };
  }

  private async runShadowDiff(args: {
    requestId: string;
    method: string;
    path: string;
    headers: Record<string, string | string[]>;
    bodyBuffer: Buffer;
    primary: ShadowResponseSummary;
    options: ShadowOptions;
  }): Promise<void> {
    const { requestId, method, path, headers, bodyBuffer, primary, options } =
      args;

    const shadow = await this.forwardToShadow({
      method,
      path,
      headers,
      bodyBuffer,
      options,
    });

    const diffs = this.compareResponses(primary, shadow, options);

    if (diffs.status || diffs.body || diffs.headers.length > 0) {
      const diffResult: ShadowDiffResult = {
        requestId,
        method,
        path,
        primary,
        shadow,
        differences: diffs,
      };
      this.logShadowDiff(diffResult);
    }
  }

  private compareResponses(
    primary: ShadowResponseSummary,
    shadow: ShadowResponseSummary,
    options: ShadowOptions,
  ): ShadowDiffResult["differences"] {
    const status = primary.statusCode !== shadow.statusCode;
    const body = primary.bodyHash !== shadow.bodyHash;

    const headerKeys = options.compareHeaders;
    if (!headerKeys || headerKeys.length === 0) {
      return {
        status,
        headers: [],
        body,
      };
    }

    const mismatched: string[] = [];
    for (const key of headerKeys) {
      const normalized = key.toLowerCase();
      const p = primary.headers?.[normalized] ?? primary.headers?.[key];
      const s = shadow.headers?.[normalized] ?? shadow.headers?.[key];
      if (JSON.stringify(p) !== JSON.stringify(s)) {
        mismatched.push(key);
      }
    }

    return {
      status,
      headers: mismatched,
      body,
    };
  }

  private logShadowDiff(result: ShadowDiffResult): void {
    const parts: string[] = [];
    if (result.differences.status) {
      parts.push(
        `status ${result.primary.statusCode ?? "?"}→${result.shadow.statusCode ?? "?"}`,
      );
    }
    if (result.differences.body) {
      parts.push("body");
    }
    if (result.differences.headers.length > 0) {
      parts.push(`headers ${result.differences.headers.join(",")}`);
    }

    const shadowError = result.shadow.error
      ? chalk.red(` shadow_error=${result.shadow.error}`)
      : "";
    const timings = ` ${chalk.dim(
      `(${result.primary.durationMs ?? "-"}ms/${result.shadow.durationMs ?? "-"}ms)`,
    )}`;

    console.log(
      chalk.yellow("⚡ Shadow diff:") +
        ` ${chalk.bold(result.method)} ${result.path} ` +
        chalk.yellow(parts.join(", ")) +
        timings +
        shadowError,
    );
  }

  private forwardToShadow(args: {
    method: string;
    path: string;
    headers: Record<string, string | string[]>;
    bodyBuffer: Buffer;
    options: ShadowOptions;
  }): Promise<ShadowResponseSummary> {
    const { method, path, headers, bodyBuffer, options } = args;
    const protocol = options.target.protocol ?? "http";
    const requestModule = protocol === "https" ? https : http;
    const shadowHeaders = { ...headers } as Record<string, string | string[]>;
    delete shadowHeaders["host"];

    return new Promise<ShadowResponseSummary>((resolve) => {
      const start = Date.now();
      const timeoutMs = options.timeoutMs ?? DEFAULT_SHADOW_TIMEOUT_MS;
      const maxBytes = options.maxBodyBytes ?? DEFAULT_SHADOW_MAX_BODY_BYTES;
      const timer = setTimeout(() => {
        resolve({
          error: "Shadow request timed out",
          durationMs: Date.now() - start,
        });
      }, timeoutMs);

      const req = requestModule.request(
        {
          hostname: options.target.host ?? "localhost",
          port: options.target.port,
          path,
          method,
          headers: shadowHeaders,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let bytes = 0;

          res.on("data", (chunk) => {
            const bufferChunk = Buffer.from(chunk);
            if (bytes < maxBytes) {
              const remaining = maxBytes - bytes;
              chunks.push(bufferChunk.subarray(0, remaining));
            }
            bytes += bufferChunk.length;
          });

          res.on("end", () => {
            clearTimeout(timer);
            const bodyBuffer = Buffer.concat(chunks);
            const durationMs = Date.now() - start;
            const bodyHash = bodyBuffer.length
              ? createHash("sha256").update(bodyBuffer).digest("hex")
              : undefined;
            resolve({
              statusCode: res.statusCode ?? 0,
              headers: res.headers as Record<string, string | string[]>,
              bodyHash,
              bodyBytes: bytes,
              durationMs,
              truncated: bytes > maxBytes,
            });
          });
        },
      );

      req.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          error: error.message,
          durationMs: Date.now() - start,
        });
      });

      if (bodyBuffer.length > 0) {
        req.write(bodyBuffer);
      }

      req.end();
    });
  }

  private startPing(): void {
    this.stopPing();
    this.lastPongReceived = Date.now();

    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();

        // Set a timeout to detect if pong is not received
        this.stopPongTimeout();
        this.pongTimeout = setTimeout(() => {
          // No pong received within timeout - connection is likely dead
          // This commonly happens after system sleep/wake
          console.log(chalk.dim("Connection appears stale, reconnecting..."));
          if (this.ws) {
            this.ws.terminate(); // Force close instead of graceful close
          }
        }, this.PONG_TIMEOUT_MS);
      }
    }, this.PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private async handleSubdomainConflict(): Promise<void> {
    console.log(
      chalk.yellow(
        `\nSubdomain "${this.requestedSubdomain}" is currently in use.`,
      ),
    );

    const response = await prompts({
      type: "select",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { title: "Take over the existing tunnel", value: "takeover" },
        { title: "Use a random subdomain instead", value: "random" },
        { title: "Exit", value: "exit" },
      ],
      initial: 0,
    });

    if (response.action === "takeover") {
      console.log(chalk.cyan("Taking over the existing tunnel..."));
      this.subdomain = this.requestedSubdomain;
      this.shouldReconnect = true;
      this.forceTakeover = true;
      this.connect();
    } else if (response.action === "random") {
      console.log(chalk.cyan("Opening tunnel with a random subdomain..."));
      this.subdomain = undefined;
      this.shouldReconnect = true;
      this.forceTakeover = false;
      this.connect();
    } else {
      console.log(chalk.cyan("Goodbye!"));
      this.stop();
      process.exit(0);
    }
  }

  private handleClose(code?: number, reason?: Buffer): void {
    this.stopPing();
    this.stopPongTimeout();
    if (!this.shouldReconnect) return;

    const reasonStr = reason?.toString() || "";

    if (code || reasonStr) {
      console.log(
        chalk.dim(
          `Connection closed${code ? ` (code ${code})` : ""}${reasonStr ? `: ${reasonStr}` : ""}`,
        ),
      );
    }

    if (code === 1000 && reasonStr === "Tunnel stopped by user") {
      console.log(chalk.red("\nTunnel stopped by user via dashboard."));
      this.stop();
      process.exit(0);
    }

    // If we previously had a tunnel URL, assume the existing session may still
    // be active on the server (e.g., after sleep). Force takeover on the next
    // handshake to reclaim it.
    if (this.assignedUrl) {
      this.forceTakeover = true;
    }

    const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts += 1;

    console.log(
      chalk.yellow(
        `Disconnected from OutRay. Retrying in ${Math.round(delay / 1000)}s…`,
      ),
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
