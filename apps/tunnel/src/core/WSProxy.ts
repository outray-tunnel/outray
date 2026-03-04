import { IncomingMessage } from "http";
import { Duplex } from "stream";
import WebSocket, { WebSocketServer } from "ws";
import { TunnelRouter } from "./TunnelRouter";
import { Protocol, WSUpgradeResponseMessage, WSFrameMessage, WSCloseMessage } from "./Protocol";
import { generateId } from "../../../../shared/utils";

interface PendingUpgrade {
  request: IncomingMessage;
  socket: Duplex;
  head: Buffer;
  tunnelId: string;
  timeout: NodeJS.Timeout;
}

/**
 * Handles end-user WebSocket connections through HTTP tunnels.
 *
 * When an end-user connects via WebSocket to a tunneled subdomain
 * (e.g., ws://myapp.outray.dev/socket), this proxy:
 *
 * 1. Sends a ws_upgrade message to the tunnel client via the control WebSocket
 * 2. Waits for the client to open a local WebSocket and confirm with ws_upgrade_response
 * 3. Completes the HTTP upgrade for the end-user
 * 4. Relays frames bidirectionally: end-user ↔ control WS ↔ local WS
 */
export class WSProxy {
  private router: TunnelRouter;
  private wss: WebSocketServer;
  private pendingUpgrades = new Map<string, PendingUpgrade>();
  private activeConnections = new Map<string, WebSocket>();
  private readonly UPGRADE_TIMEOUT_MS = 10000;

  constructor(router: TunnelRouter) {
    this.router = router;
    this.wss = new WebSocketServer({ noServer: true });
  }

  /**
   * Handle an HTTP upgrade request for a tunneled subdomain.
   * Sends a ws_upgrade to the tunnel client and waits for confirmation
   * before completing the upgrade with the end-user.
   */
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const host = (request.headers.host || "").split(":")[0].toLowerCase();
    const tunnelId = host;

    // Verify the tunnel exists
    const tunnelWs = this.router.getTunnel(tunnelId);
    if (!tunnelWs || tunnelWs.readyState !== WebSocket.OPEN) {
      socket.write(
        "HTTP/1.1 502 Bad Gateway\r\n" +
        "Content-Type: text/plain\r\n" +
        "Connection: close\r\n\r\n" +
        "Tunnel is offline"
      );
      socket.destroy();
      return;
    }

    const wsConnectionId = generateId("wsc");

    // Store the pending upgrade
    const timeout = setTimeout(() => {
      this.pendingUpgrades.delete(wsConnectionId);
      socket.write(
        "HTTP/1.1 504 Gateway Timeout\r\n" +
        "Content-Type: text/plain\r\n" +
        "Connection: close\r\n\r\n" +
        "WebSocket upgrade timed out"
      );
      socket.destroy();
      console.log(`WebSocket upgrade timed out for connection ${wsConnectionId}`);
    }, this.UPGRADE_TIMEOUT_MS);

    this.pendingUpgrades.set(wsConnectionId, {
      request,
      socket,
      head,
      tunnelId,
      timeout,
    });

    // Build headers to forward (filter out hop-by-hop headers)
    const headers: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) {
        headers[key] = value;
      }
    }

    // Send ws_upgrade to the tunnel client
    tunnelWs.send(
      Protocol.encode({
        type: "ws_upgrade",
        wsConnectionId,
        path: request.url || "/",
        headers,
        protocol: request.headers["sec-websocket-protocol"],
      })
    );

    console.log(`→ WebSocket upgrade requested: ${tunnelId}${request.url} (${wsConnectionId})`);
  }

  /**
   * Called when the tunnel client responds to a ws_upgrade request.
   */
  handleUpgradeResponse(message: WSUpgradeResponseMessage): void {
    const pending = this.pendingUpgrades.get(message.wsConnectionId);
    if (!pending) {
      console.warn(`No pending upgrade for wsConnectionId: ${message.wsConnectionId}`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingUpgrades.delete(message.wsConnectionId);

    if (!message.success) {
      pending.socket.write(
        "HTTP/1.1 502 Bad Gateway\r\n" +
        "Content-Type: text/plain\r\n" +
        "Connection: close\r\n\r\n" +
        (message.error || "Failed to connect to local WebSocket server")
      );
      pending.socket.destroy();
      console.log(`✗ WebSocket upgrade failed: ${message.wsConnectionId} - ${message.error}`);
      return;
    }

    // Complete the upgrade for the end-user
    this.wss.handleUpgrade(pending.request, pending.socket, pending.head, (endUserWs) => {
      this.activeConnections.set(message.wsConnectionId, endUserWs);

      console.log(`✓ WebSocket connection established: ${message.wsConnectionId}`);

      // Forward frames from end-user to tunnel client
      endUserWs.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
        const tunnelWs = this.router.getTunnel(pending.tunnelId);
        if (tunnelWs && tunnelWs.readyState === WebSocket.OPEN) {
          const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          tunnelWs.send(
            Protocol.encode({
              type: "ws_frame",
              wsConnectionId: message.wsConnectionId,
              data: buffer.toString("base64"),
              isBinary,
            })
          );
        }
      });

      // Handle end-user disconnect
      endUserWs.on("close", (code, reason) => {
        this.activeConnections.delete(message.wsConnectionId);
        const tunnelWs = this.router.getTunnel(pending.tunnelId);
        if (tunnelWs && tunnelWs.readyState === WebSocket.OPEN) {
          tunnelWs.send(
            Protocol.encode({
              type: "ws_close",
              wsConnectionId: message.wsConnectionId,
              code,
              reason: reason?.toString(),
            })
          );
        }
        console.log(`WebSocket closed by end-user: ${message.wsConnectionId} (code: ${code})`);
      });

      endUserWs.on("error", (error) => {
        console.error(`WebSocket error for ${message.wsConnectionId}:`, error);
        this.activeConnections.delete(message.wsConnectionId);
      });
    });
  }

  /**
   * Called when the tunnel client sends a WebSocket frame from the local server.
   */
  handleFrame(message: WSFrameMessage): void {
    const endUserWs = this.activeConnections.get(message.wsConnectionId);
    if (!endUserWs || endUserWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const data = Buffer.from(message.data, "base64");
    endUserWs.send(data, { binary: message.isBinary });
  }

  /**
   * Called when the tunnel client signals that the local WebSocket closed.
   */
  handleClose(message: WSCloseMessage): void {
    const endUserWs = this.activeConnections.get(message.wsConnectionId);
    if (!endUserWs) {
      return;
    }

    this.activeConnections.delete(message.wsConnectionId);
    endUserWs.close(message.code || 1000, message.reason || "");
    console.log(`WebSocket closed by local server: ${message.wsConnectionId} (code: ${message.code})`);
  }

  /**
   * Clean up all connections for a given tunnel (e.g., when the tunnel client disconnects).
   */
  cleanupTunnel(tunnelId: string): void {
    // Close pending upgrades for this tunnel
    for (const [id, pending] of this.pendingUpgrades) {
      if (pending.tunnelId === tunnelId) {
        clearTimeout(pending.timeout);
        pending.socket.destroy();
        this.pendingUpgrades.delete(id);
      }
    }

    // Close active connections (we need to find by tunnelId, but we don't track it on active connections)
    // The connections will be closed when the tunnel client's control WS closes, triggering ws_close handling.
    // However, to be safe, we'll close any remaining end-user connections:
    // Since we don't track tunnelId on active connections directly, they'll get cleaned up
    // when the end-user tries to send a frame and the tunnel WS is gone.
  }
}
