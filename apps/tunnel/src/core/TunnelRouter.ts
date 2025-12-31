import WebSocket from "ws";
import Redis from "ioredis";
import { Protocol, RequestMessage, ResponseMessage, Message } from "./Protocol";
import { generateId } from "../../../../shared/utils";

interface PendingRequest {
  resolve: (response: ResponseMessage) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  tunnelId: string;
}

interface TunnelRouterOptions {
  redis?: Redis;
  subRedis?: Redis;
  ttlSeconds?: number;
  heartbeatIntervalMs?: number;
  requestTimeoutMs?: number;
}

export interface TunnelMetadata {
  organizationId?: string;
  userId?: string;
  dbTunnelId?: string;
  bandwidthLimit?: number;
  retentionDays?: number;
  plan?: string;
}

export class TunnelRouter {
  private tunnels = new Map<string, WebSocket>();
  private tunnelMetadata = new Map<string, TunnelMetadata>();
  private pendingRequests = new Map<string, PendingRequest>();
  private redis?: Redis;
  private readonly serverId = generateId("tunnel-server");
  private readonly ttlSeconds: number;
  private readonly heartbeatIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(options: TunnelRouterOptions = {}) {
    this.redis = options.redis;
    this.ttlSeconds = Math.max(30, options.ttlSeconds ?? 120);
    this.heartbeatIntervalMs = Math.max(
      5000,
      options.heartbeatIntervalMs ?? 20000,
    );
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60000;

    if (this.redis) {
      this.startHeartbeat();
    }

    if (options.subRedis) {
      options.subRedis.subscribe("tunnel:control", (err) => {
        if (err) console.error("Failed to subscribe to tunnel:control", err);
      });
      options.subRedis.on("message", (channel, message) => {
        if (channel === "tunnel:control") {
          this.handleControlMessage(message);
        }
      });
    }
  }

  private handleControlMessage(message: string) {
    if (message.startsWith("kill:")) {
      const tunnelId = message.split(":")[1];
      const ws = this.tunnels.get(tunnelId);
      if (ws) {
        console.log(`Received kill command for tunnel ${tunnelId}`);
        ws.close(1000, "Tunnel stopped by user");
      }
    }
  }

  getRedis(): Redis | undefined {
    return this.redis;
  }

  async registerTunnel(
    tunnelId: string,
    ws: WebSocket,
    metadata?: TunnelMetadata,
  ): Promise<boolean> {
    this.tunnels.set(tunnelId, ws);
    if (metadata) {
      this.tunnelMetadata.set(tunnelId, metadata);
    }
    const persisted = await this.persistTunnelState(tunnelId, "XX", metadata);
    if (!persisted) {
      this.tunnels.delete(tunnelId);
      this.tunnelMetadata.delete(tunnelId);
    }
    return persisted;
  }

  async unregisterTunnel(tunnelId: string, ws: WebSocket): Promise<void> {
    const currentWs = this.tunnels.get(tunnelId);
    if (currentWs !== ws) {
      return;
    }

    const metadata = this.tunnelMetadata.get(tunnelId);
    this.tunnels.delete(tunnelId);
    this.tunnelMetadata.delete(tunnelId);

    for (const [requestId, req] of this.pendingRequests.entries()) {
      if (req.tunnelId === tunnelId) {
        clearTimeout(req.timeout);
        this.pendingRequests.delete(requestId);
        req.reject(new Error("Tunnel disconnected"));
      }
    }

    if (this.redis) {
      try {
        await this.redis.del(this.redisKey(tunnelId));
        if (metadata?.organizationId && metadata?.dbTunnelId) {
          // Remove from online set and delete last_seen
          await this.redis.srem(
            `org:${metadata.organizationId}:online_tunnels`,
            metadata.dbTunnelId,
          );
          await this.redis.del(`tunnel:last_seen:${metadata.dbTunnelId}`);
        }
      } catch (error) {
        console.error("Failed to remove tunnel reservation", error);
      }
    }
  }

  async reserveTunnel(
    tunnelId: string,
    ws: WebSocket,
    metadata?: TunnelMetadata,
    forceTakeover = false,
  ): Promise<boolean> {
    if (!this.redis) {
      const canReserve = !this.tunnels.has(tunnelId);
      if (canReserve) {
        this.tunnels.set(tunnelId, ws);
        if (metadata) {
          this.tunnelMetadata.set(tunnelId, metadata);
        }
      }
      return canReserve;
    }

    const persisted = await this.persistTunnelState(
      tunnelId,
      "NX",
      metadata,
      forceTakeover,
    );
    if (persisted) {
      this.tunnels.set(tunnelId, ws);
      if (metadata) {
        this.tunnelMetadata.set(tunnelId, metadata);
      }
    }
    return persisted;
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.redis) {
      const keys = Array.from(this.tunnels.keys()).map((id) =>
        this.redisKey(id),
      );
      if (keys.length > 0) {
        try {
          await this.redis.del(...keys);

          // Remove from organization online tunnels sets
          const pipeline = this.redis.pipeline();
          for (const [, metadata] of this.tunnelMetadata) {
            if (metadata.organizationId && metadata.dbTunnelId) {
              pipeline.srem(
                `org:${metadata.organizationId}:online_tunnels`,
                metadata.dbTunnelId,
              );
              pipeline.del(`tunnel:last_seen:${metadata.dbTunnelId}`);
            }
          }
          await pipeline.exec();
        } catch (error) {
          console.error(
            "Failed to clear tunnel reservations on shutdown",
            error,
          );
        }
      }
    }
  }

  getTunnelMetadata(tunnelId: string): TunnelMetadata | undefined {
    return this.tunnelMetadata.get(tunnelId);
  }

  getTunnel(tunnelId: string): WebSocket | undefined {
    return this.tunnels.get(tunnelId);
  }

  hasTunnel(tunnelId: string): boolean {
    return this.tunnels.has(tunnelId);
  }

  handleMessage(tunnelId: string, message: Message): void {
    if (message.type === "response") {
      const pending = this.pendingRequests.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.requestId);
        pending.resolve(message);
      }
    }
  }

  async forwardRequest(
    tunnelId: string,
    method: string,
    path: string,
    headers: Record<string, string | string[]>,
    body?: string,
  ): Promise<ResponseMessage> {
    const ws = this.tunnels.get(tunnelId);

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Tunnel not available");
    }

    const requestId = generateId("req");

    const requestMessage: RequestMessage = {
      type: "request",
      requestId,
      method,
      path,
      headers,
      body,
    };

    return new Promise<ResponseMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        console.error(
          `Request timeout for tunnel ${tunnelId}, request ${requestId}`,
        );
        reject(new Error("Request timeout"));
      }, this.requestTimeoutMs);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        tunnelId,
      });

      ws.send(Protocol.encode(requestMessage));
    });
  }

  private redisKey(tunnelId: string): string {
    return `tunnel:online:${tunnelId}`;
  }

  private async persistTunnelState(
    tunnelId: string,
    mode: "NX" | "XX",
    metadata?: TunnelMetadata,
    forceTakeover = false,
  ): Promise<boolean> {
    if (!this.redis) {
      return true;
    }

    const redisValue = JSON.stringify({
      serverId: this.serverId,
      updatedAt: Date.now(),
      ...metadata,
    });

    try {
      const key = this.redisKey(tunnelId);

      if (mode === "NX") {
        const result = await this.redis.set(
          key,
          redisValue,
          "EX",
          this.ttlSeconds,
          "NX",
        );
        if (result === "OK") {
          // Add to org's online tunnels set using dbTunnelId
          if (metadata?.organizationId && metadata?.dbTunnelId) {
            await this.redis.sadd(
              `org:${metadata.organizationId}:online_tunnels`,
              metadata.dbTunnelId,
            );
            await this.redis.set(
              `tunnel:last_seen:${metadata.dbTunnelId}`,
              Date.now().toString(),
              "EX",
              this.ttlSeconds,
            );
          }
          return true;
        }

        // If NX failed, check if we can take over
        if (metadata?.userId) {
          const existing = await this.redis.get(key);
          if (existing) {
            try {
              const parsed = JSON.parse(existing);
              if (parsed.userId === metadata.userId) {
                // Same user
                if (forceTakeover) {
                  // Force takeover requested - close existing tunnel and take over
                  if (this.tunnels.has(tunnelId)) {
                    const existingWs = this.tunnels.get(tunnelId);
                    existingWs?.close();
                    this.tunnels.delete(tunnelId);
                  }
                  await this.redis.set(key, redisValue, "EX", this.ttlSeconds);
                  if (metadata?.organizationId && metadata?.dbTunnelId) {
                    await this.redis.sadd(
                      `org:${metadata.organizationId}:online_tunnels`,
                      metadata.dbTunnelId,
                    );
                    await this.redis.set(
                      `tunnel:last_seen:${metadata.dbTunnelId}`,
                      Date.now().toString(),
                      "EX",
                      this.ttlSeconds,
                    );
                  }
                  return true;
                } else if (!this.tunnels.has(tunnelId)) {
                  // Tunnel is not active, allow takeover
                  await this.redis.set(key, redisValue, "EX", this.ttlSeconds);
                  if (metadata?.organizationId && metadata?.dbTunnelId) {
                    await this.redis.sadd(
                      `org:${metadata.organizationId}:online_tunnels`,
                      metadata.dbTunnelId,
                    );
                    await this.redis.set(
                      `tunnel:last_seen:${metadata.dbTunnelId}`,
                      Date.now().toString(),
                      "EX",
                      this.ttlSeconds,
                    );
                  }
                  return true;
                }
                // Tunnel is actively connected, deny takeover
                return false;
              }
            } catch (e) {
              // ignore parse error
            }
          }
        }
        return false;
      } else {
        // XX mode (heartbeat refresh)
        const result = await this.redis.set(
          key,
          redisValue,
          "EX",
          this.ttlSeconds,
          "XX",
        );

        if (result === null) {
          return this.persistTunnelState(tunnelId, "NX", metadata);
        }

        // Add to online_tunnels SET and refresh last_seen timestamp
        if (metadata?.organizationId && metadata?.dbTunnelId) {
          await this.redis.sadd(
            `org:${metadata.organizationId}:online_tunnels`,
            metadata.dbTunnelId,
          );
          await this.redis.set(
            `tunnel:last_seen:${metadata.dbTunnelId}`,
            Date.now().toString(),
            "EX",
            this.ttlSeconds,
          );
        }

        return true;
      }
    } catch (error) {
      console.error("Failed to persist tunnel state", error);
      return false;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      void this.refreshActiveTunnels();
    }, this.heartbeatIntervalMs);

    if (typeof this.heartbeatTimer.unref === "function") {
      this.heartbeatTimer.unref();
    }
  }

  private async refreshActiveTunnels(): Promise<void> {
    if (!this.redis || this.tunnels.size === 0) {
      return;
    }

    await Promise.all(
      Array.from(this.tunnels.keys()).map((tunnelId) => {
        const metadata = this.tunnelMetadata.get(tunnelId);
        return this.persistTunnelState(tunnelId, "XX", metadata);
      }),
    );
  }
}
