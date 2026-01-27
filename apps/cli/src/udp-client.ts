import WebSocket from "ws";
import dgram from "dgram";
import chalk from "chalk";
import { encodeMessage, decodeMessage } from "@outray/core";
import type { UDPDataMessage, UDPResponseMessage, TunnelProtocol } from "@outray/core";

export class UDPTunnelClient {
  private ws: WebSocket | null = null;
  private localPort: number;
  private localHost: string;
  private serverUrl: string;
  private apiKey?: string;
  private remotePort?: number;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private shouldReconnect = true;
  private assignedPort: number | null = null;
  private socket: dgram.Socket | null = null;
  private noLog: boolean;

  constructor(
    localPort: number,
    serverUrl: string = "wss://api.outray.dev/",
    apiKey?: string,
    localHost: string = "localhost",
    remotePort?: number,
    noLog: boolean = false,
  ) {
    this.localPort = localPort;
    this.localHost = localHost;
    this.serverUrl = serverUrl;
    this.apiKey = apiKey;
    this.remotePort = remotePort;
    this.noLog = noLog;
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

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private connect(): void {
    console.log(chalk.cyan("Connecting to OutRay (UDP mode)..."));

    // Create local UDP socket for forwarding
    this.socket = dgram.createSocket("udp4");

    this.ws = new WebSocket(this.serverUrl);

    this.ws.on("open", () => this.handleOpen());
    this.ws.on("message", (data) => this.handleMessage(data.toString()));
    this.ws.on("close", (code, reason) => this.handleClose(code, reason));
    this.ws.on("error", (error) => {
      console.log(chalk.red(`❌ WebSocket error: ${error.message}`));
    });
    this.ws.on("pong", () => {
      // Received pong, connection is alive
    });
  }

  private handleOpen(): void {
    console.log(chalk.green(`Linked to your local port ${this.localPort}`));
    this.startPing();

    const handshake = encodeMessage({
      type: "open_tunnel",
      apiKey: this.apiKey,
      protocol: "udp" as TunnelProtocol,
      remotePort: this.remotePort,
    });
    this.ws?.send(handshake);
  }

  private handleMessage(data: string): void {
    try {
      const message = decodeMessage(data);

      if (message.type === "tunnel_opened") {
        this.assignedPort = message.port || null;
        console.log(chalk.magenta(`✨ UDP Tunnel ready: ${message.url}`));
        if (this.assignedPort) {
          console.log(chalk.cyan(`Remote port: ${this.assignedPort}`));
        }
        console.log(
          chalk.yellow("Keep this running to keep your tunnel active."),
        );
      } else if (message.type === "error") {
        const lowerMessage = message.message.toLowerCase();
        const isPortInUse =
          message.code === "UDP_TUNNEL_FAILED" &&
          (lowerMessage.includes("eaddrinuse") ||
            lowerMessage.includes("address already in use") ||
            lowerMessage.includes("already in use"));

        console.log(chalk.red(`❌ Error: ${message.message}`));

        if (isPortInUse) {
          console.log(
            chalk.yellow(
              "Requested remote UDP port is already in use. Pick a different --remote-port or free the port, then try again.",
            ),
          );
          this.shouldReconnect = false;
          this.stop();
          process.exit(1);
          return;
        }
        if (
          message.code === "AUTH_FAILED" ||
          message.code === "AUTH_REQUIRED" ||
          message.code === "LIMIT_EXCEEDED"
        ) {
          this.shouldReconnect = false;
          this.stop();
          process.exit(1);
        }
      } else if (message.type === "udp_data") {
        this.handleUDPData(message as UDPDataMessage);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Failed to parse message: ${error}`));
    }
  }

  private handleUDPData(message: UDPDataMessage): void {
    const { packetId, sourceAddress, sourcePort, data } = message;
    const buffer = Buffer.from(data, "base64");

    if (!this.noLog) {
      console.log(
        chalk.dim(`← UDP packet from ${sourceAddress}:${sourcePort}`),
      );
    }

    // Forward to local service
    if (this.socket) {
      this.socket.send(buffer, this.localPort, this.localHost, (err) => {
        if (err && !this.noLog) {
          console.log(chalk.dim(`UDP forward error: ${err.message}`));
        }
      });

      // Set up one-time listener for response from local service
      const responseHandler = (msg: Buffer) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          const response: UDPResponseMessage = {
            type: "udp_response",
            packetId,
            targetAddress: sourceAddress,
            targetPort: sourcePort,
            data: msg.toString("base64"),
          };
          this.ws.send(encodeMessage(response));
        }
      };

      // Listen for response with timeout
      this.socket.once("message", responseHandler);

      // Remove listener after timeout to prevent memory leaks
      setTimeout(() => {
        this.socket?.removeListener("message", responseHandler);
      }, 5000);
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleClose(code?: number, reason?: Buffer): void {
    this.stopPing();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (!this.shouldReconnect) return;

    const reasonStr = reason?.toString() || "";

    if (code === 1000 && reasonStr === "Tunnel stopped by user") {
      console.log(chalk.red("\n🛑 Tunnel stopped by user via dashboard."));
      this.stop();
      process.exit(0);
    }

    console.log(chalk.yellow("Disconnected from OutRay. Retrying in 2s…"));

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, 2000);
  }
}
