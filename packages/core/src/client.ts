import WebSocket from "ws";
import http from "http";
import https from "https";
import { createHash, randomUUID } from "crypto";
import { encodeMessage, decodeMessage } from "./protocol";
import type {
  OutrayClientOptions,
  TunnelDataMessage,
  TunnelResponseMessage,
  ShadowDiffResult,
  ShadowOptions,
  ShadowResponseSummary,
} from "./types";

const DEFAULT_SERVER_URL = "wss://api.outray.dev/";
const PING_INTERVAL_MS = 25000;
const PONG_TIMEOUT_MS = 10000;
const DEFAULT_SHADOW_TIMEOUT_MS = 4000;
const DEFAULT_SHADOW_MAX_BODY_BYTES = 256 * 1024;

/**
 * Core Outray tunnel client.
 *
 * Establishes a WebSocket connection to the Outray server and proxies
 * HTTP requests to a local server.
 *
 * @example
 * ```ts
 * const client = new OutrayClient({
 *   localPort: 3000,
 *   onTunnelReady: (url) => console.log(`Tunnel: ${url}`),
 *   onError: (err) => console.error(err),
 * });
 *
 * client.start();
 *
 * // Later...
 * client.stop();
 * ```
 */
export class OutrayClient {
  private ws: WebSocket | null = null;
  private options: Required<
    Pick<OutrayClientOptions, "localPort" | "serverUrl">
  > &
    OutrayClientOptions;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private shouldReconnect = true;
  private assignedUrl: string | null = null;
  private subdomain?: string;
  private forceTakeover = false;
  private reconnectAttempts = 0;
  private lastPongReceived = Date.now();

  constructor(options: OutrayClientOptions) {
    this.options = {
      ...options,
      serverUrl: options.serverUrl ?? DEFAULT_SERVER_URL,
    };
    this.subdomain = options.subdomain;
  }

  /**
   * Start the tunnel connection
   */
  public start(): void {
    this.shouldReconnect = true;
    this.connect();
  }

  /**
   * Stop the tunnel connection
   */
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

  /**
   * Get the assigned tunnel URL (if connected)
   */
  public getUrl(): string | null {
    return this.assignedUrl;
  }

  /**
   * Check if the client is currently connected
   */
  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect(): void {
    this.ws = new WebSocket(this.options.serverUrl);

    this.ws.on("open", () => this.handleOpen());
    this.ws.on("message", (data) => this.handleMessage(data.toString()));
    this.ws.on("close", (code, reason) => this.handleClose(code, reason));
    this.ws.on("error", (error) => {
      this.options.onError?.(error);
    });
    this.ws.on("pong", () => {
      this.lastPongReceived = Date.now();
      this.stopPongTimeout();
    });
  }

  private handleOpen(): void {
    this.startPing();

    const handshake = encodeMessage({
      type: "open_tunnel",
      apiKey: this.options.apiKey,
      subdomain: this.subdomain,
      customDomain: this.options.customDomain,
      forceTakeover: this.forceTakeover,
      protocol: this.options.protocol,
      remotePort: this.options.remotePort,
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
        this.forceTakeover = false;
        this.reconnectAttempts = 0;
        this.options.onTunnelReady?.(message.url, message.port);
      } else if (message.type === "error") {
        this.handleError(message.code, message.message);
      } else if (message.type === "request") {
        this.handleTunnelData(message);
      }
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  private handleError(code: string, message: string): void {
    if (code === "SUBDOMAIN_IN_USE" && this.assignedUrl && !this.forceTakeover) {
      // Reconnecting and subdomain is in use - try to take over
      this.forceTakeover = true;
      this.connect();
      return;
    }

    this.options.onError?.(new Error(message), code);

    // Fatal errors - stop reconnecting
    if (code === "AUTH_FAILED" || code === "LIMIT_EXCEEDED") {
      this.shouldReconnect = false;
      this.stop();
    }
  }

  private handleTunnelData(message: TunnelDataMessage): void {
    const startTime = Date.now();
    const requestId = randomUUID();

    const reqOptions = {
      hostname: "localhost",
      port: this.options.localPort,
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

        this.options.onRequest?.({
          method: message.method,
          path: message.path,
          statusCode,
          duration,
        });

        const bodyBuffer = Buffer.concat(chunks);
        const bodyBase64 =
          bodyBuffer.length > 0 ? bodyBuffer.toString("base64") : undefined;

        const response: TunnelResponseMessage = {
          type: "response",
          requestId: message.requestId,
          statusCode,
          headers: res.headers as Record<string, string | string[]>,
          body: bodyBase64,
        };

        this.ws?.send(encodeMessage(response));

        const shadowOptions = this.options.shadow;
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

      this.options.onRequest?.({
        method: message.method,
        path: message.path,
        statusCode: 502,
        duration,
        error: err.message,
      });

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
    } catch {
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
      this.options.shadow?.maxBodyBytes ?? DEFAULT_SHADOW_MAX_BODY_BYTES;
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
      this.options.onShadowDiff?.(diffResult);
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
    const shadowHeaders = { ...headers };
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

        this.stopPongTimeout();
        this.pongTimeout = setTimeout(() => {
          // No pong received - connection is likely dead
          if (this.ws) {
            this.ws.terminate();
          }
        }, PONG_TIMEOUT_MS);
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private stopPongTimeout(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private handleClose(code?: number, reason?: Buffer): void {
    this.stopPing();
    this.stopPongTimeout();

    if (!this.shouldReconnect) return;

    const reasonStr = reason?.toString() || "";

    if (code === 1000 && reasonStr === "Tunnel stopped by user") {
      this.options.onClose?.(reasonStr);
      this.stop();
      return;
    }

    // If we previously had a tunnel URL, force takeover on reconnect
    if (this.assignedUrl) {
      this.forceTakeover = true;
    }

    const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts += 1;

    this.options.onReconnecting?.(this.reconnectAttempts, delay);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
