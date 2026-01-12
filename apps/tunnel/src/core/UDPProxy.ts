import dgram from "dgram";
import WebSocket from "ws";
import Redis from "ioredis";
import { Protocol, UDPDataMessage, UDPResponseMessage } from "./Protocol";
import { generateId, getBandwidthKey } from "../../../../shared/utils";
import { protocolLogger } from "../lib/tigerdata";
import { PortAllocator } from "./PortAllocator";

interface UDPClient {
  address: string;
  port: number;
  lastActivity: number;
  bytesIn: number;
  bytesOut: number;
}

interface UDPTunnel {
  socket: dgram.Socket;
  ws: WebSocket;
  tunnelId: string;
  organizationId: string;
  dbTunnelId?: string;
  bandwidthLimit?: number;
  port: number;
  clients: Map<string, UDPClient>;
}

export class UDPProxy {
  private tunnels = new Map<string, UDPTunnel>();
  private packetToClient = new Map<
    string,
    { tunnelId: string; clientKey: string; createdAt: number }
  >();
  private portAllocator: PortAllocator;
  private clientTimeout = 60000; // 60 seconds
  private packetTtl: number;
  private redis?: Redis;

  constructor(
    portRangeMin: number = 30001,
    portRangeMax: number = 40000,
    redis?: Redis,
    packetTtl: number = 30000, // Default 30s
  ) {
    this.portAllocator = new PortAllocator(portRangeMin, portRangeMax);
    this.redis = redis;
    this.packetTtl = packetTtl;
    // Periodically clean up stale clients
    setInterval(() => this.cleanupStaleClients(), 30000);
  }

  async createTunnel(
    tunnelId: string,
    ws: WebSocket,
    organizationId: string,
    requestedPort?: number,
    bandwidthLimit?: number,
  ): Promise<{ success: boolean; port?: number; error?: string }> {
    // Clean up existing tunnel if any
    await this.closeTunnel(tunnelId);

    const port = this.portAllocator.allocate(requestedPort);
    if (!port) {
      return { success: false, error: "No available ports" };
    }

    return new Promise((resolve) => {
      const socket = dgram.createSocket("udp4");

      socket.on("error", (err) => {
        console.error(`UDP Socket error for tunnel ${tunnelId}:`, err);
        socket.close(() => {
          this.tunnels.delete(tunnelId);
          this.portAllocator.release(port);
          resolve({ success: false, error: err.message });
        });
        resolve({ success: false, error: err.message });
      });

      socket.on("message", (msg, rinfo) => {
        this.handleMessage(tunnelId, msg, rinfo);
      });

      socket.bind(port, () => {
        console.log(`UDP tunnel ${tunnelId} listening on port ${port}`);
        // Port already marked as used by allocator

        const tunnel: UDPTunnel = {
          socket,
          ws,
          tunnelId,
          organizationId,
          bandwidthLimit,
          port,
          clients: new Map(),
        };

        this.tunnels.set(tunnelId, tunnel);
        resolve({ success: true, port });
      });
    });
  }

  setDbTunnelId(tunnelId: string, dbTunnelId: string): void {
    const tunnel = this.tunnels.get(tunnelId);
    if (tunnel) {
      tunnel.dbTunnelId = dbTunnelId;
    }
  }

  // Port allocation is now handled by PortAllocator with O(1) complexity

  private async handleMessage(
    tunnelId: string,
    msg: Buffer,
    rinfo: dgram.RemoteInfo,
  ): Promise<void> {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel || tunnel.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (await this.checkBandwidthExceeded(tunnel, msg.length)) {
      return; // Drop packet if bandwidth exceeded
    }

    const clientKey = `${rinfo.address}:${rinfo.port}`;

    // Track client for response routing
    let client = tunnel.clients.get(clientKey);
    if (!client) {
      client = {
        address: rinfo.address,
        port: rinfo.port,
        lastActivity: Date.now(),
        bytesIn: 0,
        bytesOut: 0,
      };
      tunnel.clients.set(clientKey, client);
    }

    client.lastActivity = Date.now();
    client.bytesIn += msg.length;

    if (tunnel.dbTunnelId) {
      protocolLogger.logUDPPacket(
        tunnel.dbTunnelId,
        tunnel.organizationId,
        rinfo.address,
        rinfo.port,
        msg.length,
        0,
      );
    }

    const packetId = generateId("udp");
    this.packetToClient.set(packetId, {
      tunnelId,
      clientKey,
      createdAt: Date.now(),
    });

    // Forward to client via WebSocket
    const dataMsg: UDPDataMessage = {
      type: "udp_data",
      packetId,
      sourceAddress: rinfo.address,
      sourcePort: rinfo.port,
      data: msg.toString("base64"),
    };
    tunnel.ws.send(Protocol.encode(dataMsg));
  }

  async handleClientResponse(response: UDPResponseMessage): Promise<void> {
    const mapping = this.packetToClient.get(response.packetId);
    if (!mapping) {
      // Try to find the tunnel by target address/port
      for (const [, tunnel] of this.tunnels) {
        const client = tunnel.clients.get(
          `${response.targetAddress}:${response.targetPort}`,
        );
        if (client) {
          const data = Buffer.from(response.data, "base64");

          if (await this.checkBandwidthExceeded(tunnel, data.length)) {
            return; // Drop packet if bandwidth exceeded
          }

          client.bytesOut += data.length;

          if (tunnel.dbTunnelId) {
            protocolLogger.logUDPPacket(
              tunnel.dbTunnelId,
              tunnel.organizationId,
              client.address,
              client.port,
              0,
              data.length,
            );
          }

          tunnel.socket.send(data, client.port, client.address);
          return;
        }
      }
      return;
    }

    const tunnel = this.tunnels.get(mapping.tunnelId);
    if (!tunnel) {
      this.packetToClient.delete(response.packetId);
      return;
    }

    const client = tunnel.clients.get(mapping.clientKey);
    if (!client) {
      this.packetToClient.delete(response.packetId);
      return;
    }

    const data = Buffer.from(response.data, "base64");

    if (await this.checkBandwidthExceeded(tunnel, data.length)) {
      this.packetToClient.delete(response.packetId);
      return;
    }

    client.bytesOut += data.length;

    if (tunnel.dbTunnelId) {
      protocolLogger.logUDPPacket(
        tunnel.dbTunnelId,
        tunnel.organizationId,
        client.address,
        client.port,
        0,
        data.length,
      );
    }

    tunnel.socket.send(data, client.port, client.address);
    this.packetToClient.delete(response.packetId);
  }

  private async checkBandwidthExceeded(
    tunnel: UDPTunnel,
    bytes: number,
  ): Promise<boolean> {
    if (!this.redis || !tunnel.bandwidthLimit || tunnel.bandwidthLimit === -1) {
      return false;
    }

    const bandwidthKey = getBandwidthKey(tunnel.organizationId);
    const newUsage = await this.redis.incrby(bandwidthKey, bytes);
    return newUsage > tunnel.bandwidthLimit;
  }

  private cleanupStaleClients(): void {
    const now = Date.now();
    for (const [, tunnel] of this.tunnels) {
      for (const [key, client] of tunnel.clients) {
        if (now - client.lastActivity > this.clientTimeout) {
          tunnel.clients.delete(key);
        }
      }
    }

    // Clean up old packet mappings using insertion order
    let cleaned = 0;
    for (const [packetId, mapping] of this.packetToClient) {
      if (now - mapping.createdAt > this.packetTtl) {
        this.packetToClient.delete(packetId);
        cleaned++;
      } else {
        // Map iterates in insertion order. If we hit a packet that is not expired,
        // all subsequent packets are also not expired... so we can just break here...
        break;
      }
    }

    if (cleaned > 100) {
      console.debug(`Cleaned ${cleaned} stale UDP packet mappings`);
    }
  }

  async closeTunnel(tunnelId: string): Promise<void> {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return;

    // Clean up packet mappings
    for (const [packetId, mapping] of this.packetToClient) {
      if (mapping.tunnelId === tunnelId) {
        this.packetToClient.delete(packetId);
      }
    }

    return new Promise((resolve) => {
      tunnel.socket.close(() => {
        this.portAllocator.release(tunnel.port);
        this.tunnels.delete(tunnelId);
        console.log(`UDP tunnel ${tunnelId} closed`);
        resolve();
      });
    });
  }

  getTunnelPort(tunnelId: string): number | undefined {
    return this.tunnels.get(tunnelId)?.port;
  }

  hasTunnel(tunnelId: string): boolean {
    return this.tunnels.has(tunnelId);
  }
}
