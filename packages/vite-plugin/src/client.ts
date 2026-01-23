import WebSocket from "ws";
import http from "http";
import { encodeMessage, decodeMessage } from "./protocol";
import type {
  OutrayClientOptions,
  TunnelDataMessage,
  TunnelResponseMessage,
} from "./types";

export class OutRayClient {
  private ws: WebSocket | null = null;
  private options: OutrayClientOptions;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private shouldReconnect = true;
  private assignedUrl: string | null = null;
  private subdomain?: string;
  private forceTakeover = false;
  private reconnectAttempts = 0;
  private lastPongReceived = Date.now();

  private readonly PING_INTERVAL_MS = 25000; // 25 seconds
  private readonly PONG_TIMEOUT_MS = 10000; // 10 seconds to wait for pong

  constructor(options: OutrayClientOptions) {
    this.options = options;
    this.subdomain = options.subdomain;
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

  public getUrl(): string | null {
    return this.assignedUrl;
  }

  private connect(): void {
    this.ws = new WebSocket(this.options.serverUrl);

    this.ws.on("open", () => this.handleOpen());
    this.ws.on("message", (data) => this.handleMessage(data.toString()));
    this.ws.on("close", (code, reason) => this.handleClose(code, reason));
    this.ws.on("error", (error) => {
      this.options.onError?.(error);
      // Ensure fatal WebSocket errors trigger cleanup and reconnect logic
      if (this.ws && this.ws.readyState !== WebSocket.CLOSING && this.ws.readyState !== WebSocket.CLOSED) {
        this.ws.terminate();
      }
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
        this.options.onTunnelReady?.(message.url);
      } else if (message.type === "error") {
        if (
          message.code === "SUBDOMAIN_IN_USE" &&
          this.assignedUrl &&
          !this.forceTakeover
        ) {
          // Reconnecting and subdomain is in use - try to take over
          if (
            this.ws &&
            (this.ws.readyState === WebSocket.OPEN ||
              this.ws.readyState === WebSocket.CONNECTING)
          ) {
            this.ws.close();
          }
          this.forceTakeover = true;
          this.connect();
          return;
        }

        this.options.onError?.(new Error(message.message));

        if (
          message.code === "AUTH_FAILED" ||
          message.code === "LIMIT_EXCEEDED"
        ) {
          this.shouldReconnect = false;
          this.stop();
        }
      } else if (message.type === "request") {
        this.handleTunnelData(message);
      }
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  private handleTunnelData(message: TunnelDataMessage): void {
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
        const bodyBuffer = Buffer.concat(chunks);
        const bodyBase64 =
          bodyBuffer.length > 0 ? bodyBuffer.toString("base64") : undefined;

        const response: TunnelResponseMessage = {
          type: "response",
          requestId: message.requestId,
          statusCode: res.statusCode || 200,
          headers: res.headers as Record<string, string | string[]>,
          ...(bodyBase64 !== undefined ? { body: bodyBase64 } : {}),
        };

        this.ws?.send(encodeMessage(response));
      });
    });

    req.setTimeout(30000, () => {
      req.destroy(new Error("Request to local server timed out"));
    });

    req.on("error", (err) => {
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
      const parts = hostname.split(".");
      // Only extract subdomain if there are at least 2 parts (subdomain + domain)
      if (parts.length >= 2) {
        return parts[0];
      }
      return null;
    } catch {
      return null;
    }
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
      this.options.onClose?.();
      this.stop();
      return;
    }

    // If we previously had a tunnel URL, force takeover on reconnect
    if (this.assignedUrl) {
      this.forceTakeover = true;
    }

    const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts += 1;

    this.options.onReconnecting?.();

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
