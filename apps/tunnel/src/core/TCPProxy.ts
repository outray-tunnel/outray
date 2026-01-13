import net from "net";
import WebSocket from "ws";
import Redis from "ioredis";
import { IpGuard } from "../lib/IpGuard";
import {
  Protocol,
  TCPConnectionMessage,
  TCPDataMessage,
  TCPCloseMessage,
} from "./Protocol";
import { generateId, getBandwidthKey } from "../../../../shared/utils";
import { protocolLogger } from "../lib/tigerdata";
import { PortAllocator } from "./PortAllocator";

interface TCPConnection {
  socket: net.Socket;
  tunnelId: string;
  connectionId: string;
  clientIp: string;
  clientPort: number;
  connectedAt: number;
  bytesIn: number;
  bytesOut: number;
}

interface TCPTunnel {
  server: net.Server;
  ws: WebSocket;
  tunnelId: string;
  organizationId: string;
  dbTunnelId?: string;
  bandwidthLimit?: number;
  port: number;
  connections: Map<string, TCPConnection>;
  ipAllowlist?: string[];
}

export class TCPProxy {
  private tunnels = new Map<string, TCPTunnel>();
  private connectionToTunnel = new Map<string, string>();
  private portAllocator: PortAllocator;
  private redis?: Redis;

  constructor(
    portRangeMin: number = 20000,
    portRangeMax: number = 30000,
    redis?: Redis,
  ) {
    this.portAllocator = new PortAllocator(portRangeMin, portRangeMax);
    this.redis = redis;
  }

  async createTunnel(
    tunnelId: string,
    ws: WebSocket,
    organizationId: string,
    requestedPort?: number,
    bandwidthLimit?: number,
    ipAllowlist?: string[],
  ): Promise<{ success: boolean; port?: number; error?: string }> {
    // Clean up existing tunnel if any
    await this.closeTunnel(tunnelId);

    const port = this.portAllocator.allocate(requestedPort);
    if (!port) {
      return { success: false, error: "No available ports" };
    }

    return new Promise((resolve) => {
      const server = net.createServer((socket) => {
        this.handleConnection(tunnelId, socket);
      });

      server.on("error", (err) => {
        console.error(`TCP Server error for tunnel ${tunnelId}:`, err);
        this.portAllocator.release(port);
        resolve({ success: false, error: err.message });
      });

      server.listen(port, () => {
        console.log(`TCP tunnel ${tunnelId} listening on port ${port}`);
        // Port already marked as used by allocator

        const tunnel: TCPTunnel = {
          server,
          ws,
          tunnelId,
          organizationId,
          bandwidthLimit,
          port,
          connections: new Map(),
          ipAllowlist,
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

  private handleConnection(tunnelId: string, socket: net.Socket): void {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel || tunnel.ws.readyState !== WebSocket.OPEN) {
      socket.destroy();
      return;
    }

    const rawIp = socket.remoteAddress || "0.0.0.0";
    const clientIp = IpGuard.normalizeIp(rawIp);

    if (tunnel.ipAllowlist && tunnel.ipAllowlist.length > 0) {
      if (!IpGuard.isAllowed(clientIp, tunnel.ipAllowlist)) {
        socket.destroy();
        return;
      }
    }

    const connectionId = generateId("tcp");
    const clientPort = socket.remotePort || 0;

    const connection: TCPConnection = {
      socket,
      tunnelId,
      connectionId,
      clientIp,
      clientPort,
      connectedAt: Date.now(),
      bytesIn: 0,
      bytesOut: 0,
    };

    tunnel.connections.set(connectionId, connection);
    this.connectionToTunnel.set(connectionId, tunnelId);

    // Log new connection (only if we have dbTunnelId)
    if (tunnel.dbTunnelId) {
      protocolLogger.logTCPConnection(
        tunnel.dbTunnelId,
        tunnel.organizationId,
        connectionId,
        clientIp,
        clientPort,
      );
    }

    // Notify client of new connection
    const connectMsg: TCPConnectionMessage = {
      type: "tcp_connection",
      connectionId,
    };
    tunnel.ws.send(Protocol.encode(connectMsg));

    // Handle incoming data from external client
    socket.on("data", async (data) => {
      if (tunnel.ws.readyState !== WebSocket.OPEN) {
        socket.destroy();
        return;
      }

      if (await this.checkBandwidthExceeded(tunnel, data.length)) {
        socket.destroy();
        return;
      }

      connection.bytesIn += data.length;

      if (tunnel.dbTunnelId) {
        protocolLogger.logTCPData(
          tunnel.dbTunnelId,
          tunnel.organizationId,
          connectionId,
          clientIp,
          clientPort,
          data.length,
          0,
        );
      }

      const dataMsg: TCPDataMessage = {
        type: "tcp_data",
        connectionId,
        data: data.toString("base64"),
      };
      tunnel.ws.send(Protocol.encode(dataMsg));
    });

    socket.on("close", () => {
      this.handleConnectionClose(connectionId, tunnelId, true);
    });

    socket.on("error", (err) => {
      console.error(`TCP connection error for ${connectionId}:`, err.message);
      this.handleConnectionClose(connectionId, tunnelId, true);
    });
  }

  private handleConnectionClose(
    connectionId: string,
    tunnelId: string,
    notifyClient: boolean,
  ): void {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return;

    const connection = tunnel.connections.get(connectionId);
    if (!connection) return;

    const duration = Date.now() - connection.connectedAt;
    if (tunnel.dbTunnelId) {
      protocolLogger.logTCPClose(
        tunnel.dbTunnelId,
        tunnel.organizationId,
        connectionId,
        connection.clientIp,
        connection.clientPort,
        duration,
      );
    }

    tunnel.connections.delete(connectionId);
    this.connectionToTunnel.delete(connectionId);

    if (notifyClient && tunnel.ws.readyState === WebSocket.OPEN) {
      const closeMsg: TCPCloseMessage = {
        type: "tcp_close",
        connectionId,
      };
      tunnel.ws.send(Protocol.encode(closeMsg));
    }
  }

  // Handle data coming from the local client via WebSocket
  async handleClientData(connectionId: string, data: Buffer): Promise<void> {
    const tunnelId = this.connectionToTunnel.get(connectionId);
    if (!tunnelId) {
      console.log(`[TCPProxy] No tunnel found for connection ${connectionId}`);
      return;
    }

    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) {
      console.log(`[TCPProxy] Tunnel ${tunnelId} not found`);
      return;
    }

    const connection = tunnel.connections.get(connectionId);
    if (!connection) {
      console.log(
        `[TCPProxy] Connection ${connectionId} not found in tunnel ${tunnelId}`,
      );
      return;
    }

    if (await this.checkBandwidthExceeded(tunnel, data.length)) {
      connection.socket.destroy();
      return;
    }

    connection.bytesOut += data.length;

    if (tunnel.dbTunnelId) {
      protocolLogger.logTCPData(
        tunnel.dbTunnelId,
        tunnel.organizationId,
        connectionId,
        connection.clientIp,
        connection.clientPort,
        0,
        data.length,
      );
    }

    console.log(
      `[TCPProxy] Writing ${data.length} bytes to external client for ${connectionId}`,
    );
    connection.socket.write(data);
  }

  private async checkBandwidthExceeded(
    tunnel: TCPTunnel,
    bytes: number,
  ): Promise<boolean> {
    if (!this.redis || !tunnel.bandwidthLimit || tunnel.bandwidthLimit === -1) {
      return false;
    }

    const bandwidthKey = getBandwidthKey(tunnel.organizationId);
    const newUsage = await this.redis.incrby(bandwidthKey, bytes);
    return newUsage > tunnel.bandwidthLimit;
  }

  // Handle close from local client
  handleClientClose(connectionId: string): void {
    const tunnelId = this.connectionToTunnel.get(connectionId);
    if (!tunnelId) return;

    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return;

    const connection = tunnel.connections.get(connectionId);
    if (!connection) return;

    connection.socket.end();
    tunnel.connections.delete(connectionId);
    this.connectionToTunnel.delete(connectionId);
  }

  async closeTunnel(tunnelId: string): Promise<void> {
    const tunnel = this.tunnels.get(tunnelId);
    if (!tunnel) return;

    // Close all connections
    for (const [connectionId, connection] of tunnel.connections) {
      connection.socket.destroy();
      this.connectionToTunnel.delete(connectionId);
    }

    // Close server
    return new Promise((resolve) => {
      tunnel.server.close(() => {
        this.portAllocator.release(tunnel.port);
        this.tunnels.delete(tunnelId);
        console.log(`TCP tunnel ${tunnelId} closed`);
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
