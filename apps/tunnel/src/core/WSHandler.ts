import WebSocket, { WebSocketServer } from "ws";
import { Server as HTTPServer } from "http";
import { TunnelRouter } from "./TunnelRouter";
import { TCPProxy } from "./TCPProxy";
import { UDPProxy } from "./UDPProxy";
import {
  Protocol,
  Message,
  TCPDataMessage,
  TCPCloseMessage,
  UDPResponseMessage,
} from "./Protocol";
import { generateId, generateSubdomain } from "../../../../shared/utils";
import { config } from "../config";

export class WSHandler {
  private wss: WebSocketServer;
  private router: TunnelRouter;
  private tcpProxy: TCPProxy;
  private udpProxy: UDPProxy;
  private webApiUrl: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
  private readonly HEARTBEAT_TIMEOUT_MS = 35000; // 35 seconds (slightly longer than interval)

  constructor(
    wss: WebSocketServer,
    router: TunnelRouter,
    tcpProxy?: TCPProxy,
    udpProxy?: UDPProxy,
  ) {
    this.router = router;
    this.wss = wss;
    this.tcpProxy = tcpProxy || new TCPProxy();
    this.udpProxy = udpProxy || new UDPProxy();
    this.webApiUrl = process.env.WEB_API_URL || "http://localhost:3000/api";
    this.setupWebSocketServer();
    this.startHeartbeatCheck();
  }

  /**
   * Server-side heartbeat check to detect and clean up dead connections.
   * This handles cases where clients go to sleep (laptop lid close) and
   * connections become "half-open" zombies that block reconnection.
   */
  private startHeartbeatCheck(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: WebSocket) => {
        const extWs = ws as WebSocket & {
          isAlive?: boolean;
          tunnelId?: string;
        };

        if (extWs.isAlive === false) {
          // Client didn't respond to previous ping, terminate connection
          console.log(
            `Terminating unresponsive connection${extWs.tunnelId ? ` for tunnel ${extWs.tunnelId}` : ""}`,
          );
          return ws.terminate();
        }

        // Mark as not alive until we get a pong
        extWs.isAlive = false;
        ws.ping();
      });
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  public shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async validateAuthToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    organizationId?: string;
    organization?: any;
    error?: string;
    tokenType?: "legacy" | "org";
    bandwidthLimit?: number;
    retentionDays?: number;
    plan?: string;
    fullCaptureEnabled?: boolean;
  }> {
    try {
      const response = await fetch(`${this.webApiUrl}/tunnel/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return (await response.json()) as {
        valid: boolean;
        userId?: string;
        organizationId?: string;
        organization?: any;
        error?: string;
        tokenType?: "legacy" | "org";
        bandwidthLimit?: number;
        retentionDays?: number;
        plan?: string;
        fullCaptureEnabled?: boolean;
      };
    } catch (error) {
      console.error("Failed to validate Auth Token:", error);
      return { valid: false, error: "Internal server error" };
    }
  }

  private async checkSubdomain(
    subdomain: string,
    organizationId?: string,
  ): Promise<{
    allowed: boolean;
    type?: "owned" | "available";
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.webApiUrl}/tunnel/check-subdomain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain, organizationId }),
      });
      return (await response.json()) as {
        allowed: boolean;
        type?: "owned" | "available";
        error?: string;
      };
    } catch (error) {
      console.error("Failed to check subdomain:", error);
      return { allowed: false, error: "Internal server error" };
    }
  }

  private async registerTunnelInDatabase(
    userId: string,
    organizationId: string,
    url: string,
    options?: {
      protocol?: "http" | "tcp" | "udp";
      remotePort?: number;
      tunnelId?: string;
      name?: string;
    },
  ): Promise<{ success: boolean; tunnelId?: string; error?: string }> {
    try {
      const response = await fetch(`${this.webApiUrl}/tunnel/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          organizationId,
          url,
          protocol: options?.protocol || "http",
          remotePort: options?.remotePort,
          tunnelId: options?.tunnelId,
          name: options?.name,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as {
        success: boolean;
        tunnelId?: string;
      };
      return {
        success: true,
        tunnelId: data.tunnelId,
      };
    } catch (error) {
      console.error("Failed to register tunnel in database:", error);
      return { success: false, error: "Failed to connect to API" };
    }
  }

  private async verifyCustomDomain(
    domain: string,
    organizationId: string,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch(
        `${this.webApiUrl}/domain/verify-ownership`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domain,
            organizationId,
          }),
        },
      );
      const data = (await response.json()) as {
        valid: boolean;
        error?: string;
      };
      return data;
    } catch (error) {
      console.error("Failed to verify custom domain:", error);
      return { valid: false, error: "Failed to verify custom domain" };
    }
  }

  private setupWebSocketServer(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      // Extend WebSocket with heartbeat tracking
      const extWs = ws as WebSocket & { isAlive: boolean; tunnelId?: string };
      extWs.isAlive = true;

      // Handle pong responses from clients
      ws.on("pong", () => {
        extWs.isAlive = true;
      });

      let tunnelId: string | null = null;

      ws.on("message", async (data: WebSocket.Data) => {
        try {
          const message = Protocol.decode(data.toString()) as Message;

          if (message.type === "hello") {
            console.log(`Client connected: ${message.clientId}`);
          } else if (message.type === "open_tunnel") {
            let organizationId: string | undefined;
            let userId: string | undefined;
            let bandwidthLimit: number | undefined;
            let retentionDays: number | undefined;
            let plan: string | undefined;
            let fullCaptureEnabled: boolean | undefined;

            if (message.apiKey) {
              const authResult = await this.validateAuthToken(message.apiKey);
              if (!authResult.valid) {
                console.log(`Invalid Auth Token: ${authResult.error}`);
                ws.send(
                  Protocol.encode({
                    type: "error",
                    code: "AUTH_FAILED",
                    message: authResult.error || "Authentication failed",
                  }),
                );
                ws.close();
                return;
              }
              organizationId = authResult.organizationId;
              userId = authResult.userId;
              bandwidthLimit = authResult.bandwidthLimit;
              retentionDays = authResult.retentionDays;
              plan = authResult.plan;
              fullCaptureEnabled = authResult.fullCaptureEnabled;
              console.log(
                `Authenticated organization: ${authResult.organization?.name}`,
              );
            }

            const tunnelProtocol = message.protocol || "http";
            if (tunnelProtocol === "tcp" || tunnelProtocol === "udp") {
              if (!organizationId) {
                ws.send(
                  Protocol.encode({
                    type: "error",
                    code: "AUTH_REQUIRED",
                    message: "Authentication required for TCP/UDP tunnels",
                  }),
                );
                ws.close();
                return;
              }

              const tunnelName = generateSubdomain();
              const tunnelIdForProtocol = tunnelName;

              if (tunnelProtocol === "tcp") {
                const result = await this.tcpProxy.createTunnel(
                  tunnelIdForProtocol,
                  ws,
                  organizationId || "",
                  message.remotePort,
                  bandwidthLimit,
                );

                if (!result.success) {
                  ws.send(
                    Protocol.encode({
                      type: "error",
                      code: "TCP_TUNNEL_FAILED",
                      message: result.error || "Failed to create TCP tunnel",
                    }),
                  );
                  ws.close();
                  return;
                }

                // Register tunnel in database first to get dbTunnelId
                let dbTunnelId: string | undefined;
                if (userId && organizationId) {
                  const dbResult = await this.registerTunnelInDatabase(
                    userId,
                    organizationId,
                    `tcp://${tunnelName}.${config.baseDomain}:${result.port}`,
                    {
                      protocol: "tcp",
                      remotePort: result.port,
                      tunnelId: tunnelIdForProtocol,
                      name: tunnelName,
                    },
                  );
                  if (!dbResult.success) {
                    console.error(
                      `Failed to register TCP tunnel in database: ${dbResult.error}`,
                    );
                  } else {
                    dbTunnelId = dbResult.tunnelId;
                    // Set the dbTunnelId on the TCP proxy for logging
                    if (dbTunnelId) {
                      this.tcpProxy.setDbTunnelId(
                        tunnelIdForProtocol,
                        dbTunnelId,
                      );
                    }
                  }
                }

                // Reserve tunnel in Redis for routing (with dbTunnelId for online tracking)
                await this.router.reserveTunnel(tunnelIdForProtocol, ws, {
                  organizationId,
                  userId,
                  dbTunnelId,
                  bandwidthLimit,
                  retentionDays,
                  fullCaptureEnabled,
                });

                tunnelId = tunnelIdForProtocol;
                extWs.tunnelId = tunnelIdForProtocol; // Track for heartbeat logging
                ws.send(
                  Protocol.encode({
                    type: "tunnel_opened",
                    tunnelId: tunnelIdForProtocol,
                    url: `tcp://${tunnelName}.${config.baseDomain}:${result.port}`,
                    protocol: "tcp",
                    port: result.port,
                    plan,
                  }),
                );
                console.log(
                  `TCP tunnel opened: ${tunnelIdForProtocol} on port ${result.port}`,
                );
              } else {
                // UDP
                const result = await this.udpProxy.createTunnel(
                  tunnelIdForProtocol,
                  ws,
                  organizationId || "",
                  message.remotePort,
                  bandwidthLimit,
                );

                if (!result.success) {
                  ws.send(
                    Protocol.encode({
                      type: "error",
                      code: "UDP_TUNNEL_FAILED",
                      message: result.error || "Failed to create UDP tunnel",
                    }),
                  );
                  ws.close();
                  return;
                }

                // Register tunnel in database first to get dbTunnelId
                let dbTunnelId: string | undefined;
                if (userId && organizationId) {
                  const dbResult = await this.registerTunnelInDatabase(
                    userId,
                    organizationId,
                    `udp://${tunnelName}.${config.baseDomain}:${result.port}`,
                    {
                      protocol: "udp",
                      remotePort: result.port,
                      tunnelId: tunnelIdForProtocol,
                      name: tunnelName,
                    },
                  );
                  if (!dbResult.success) {
                    console.error(
                      `Failed to register UDP tunnel in database: ${dbResult.error}`,
                    );
                  } else {
                    dbTunnelId = dbResult.tunnelId;
                    // Set the dbTunnelId on the UDP proxy for logging
                    if (dbTunnelId) {
                      this.udpProxy.setDbTunnelId(
                        tunnelIdForProtocol,
                        dbTunnelId,
                      );
                    }
                  }
                }

                // Reserve tunnel in Redis for routing (with dbTunnelId for online tracking)
                await this.router.reserveTunnel(tunnelIdForProtocol, ws, {
                  organizationId,
                  userId,
                  dbTunnelId,
                  bandwidthLimit,
                  retentionDays,
                  fullCaptureEnabled,
                });

                tunnelId = tunnelIdForProtocol;
                extWs.tunnelId = tunnelIdForProtocol; // Track for heartbeat logging
                ws.send(
                  Protocol.encode({
                    type: "tunnel_opened",
                    tunnelId: tunnelIdForProtocol,
                    url: `udp://${tunnelName}.${config.baseDomain}:${result.port}`,
                    protocol: "udp",
                    port: result.port,
                    plan,
                  }),
                );
                console.log(
                  `UDP tunnel opened: ${tunnelIdForProtocol} on port ${result.port}`,
                );
              }
              return;
            }

            // Check if custom domain is requested
            if (message.customDomain) {
              if (!organizationId) {
                ws.send(
                  Protocol.encode({
                    type: "error",
                    code: "AUTH_REQUIRED",
                    message: "Authentication required for custom domains",
                  }),
                );
                ws.close();
                return;
              }

              // Verify custom domain belongs to organization
              const domainCheck = await this.verifyCustomDomain(
                message.customDomain,
                organizationId,
              );

              if (!domainCheck.valid) {
                ws.send(
                  Protocol.encode({
                    type: "error",
                    code: "DOMAIN_NOT_VERIFIED",
                    message: domainCheck.error || "Custom domain not verified",
                  }),
                );
                ws.close();
                return;
              }

              // Use custom domain as tunnel ID
              tunnelId = message.customDomain;
              extWs.tunnelId = message.customDomain; // Track for heartbeat logging
              const tunnelUrl = `https://${message.customDomain}`;

              // Register tunnel in database and check limits
              let dbTunnelId: string | undefined;
              if (userId && organizationId) {
                const result = await this.registerTunnelInDatabase(
                  userId,
                  organizationId,
                  tunnelUrl,
                  {
                    name: message.customDomain,
                  },
                );
                if (!result.success) {
                  ws.send(
                    Protocol.encode({
                      type: "error",
                      code: "REGISTRATION_FAILED",
                      message: result.error || "Failed to register tunnel",
                    }),
                  );
                  ws.close();
                  return;
                }
                dbTunnelId = result.tunnelId;
              }

              const registered = await this.router.registerTunnel(
                tunnelId,
                ws,
                {
                  organizationId,
                  userId,
                  dbTunnelId,
                  bandwidthLimit,
                  plan,
                  fullCaptureEnabled,
                },
              );

              if (!registered) {
                ws.send(
                  Protocol.encode({
                    type: "error",
                    code: "DOMAIN_IN_USE",
                    message: "Custom domain is already in use",
                  }),
                );
                ws.close();
                return;
              }

              ws.send(
                Protocol.encode({
                  type: "tunnel_opened",
                  tunnelId,
                  url: tunnelUrl,
                  plan,
                }),
              );
              console.log(`Tunnel opened with custom domain: ${tunnelId}`);
              return;
            }

            let requestedSubdomain = message.subdomain;
            let reservationAcquired = false;

            console.log(
              `Requested subdomain from client: ${requestedSubdomain}`,
            );
            console.log(`Organization ID: ${organizationId}`);

            if (requestedSubdomain) {
              const check = await this.checkSubdomain(
                requestedSubdomain,
                organizationId,
              );

              console.log(`Subdomain check result:`, check);

              if (!check.allowed) {
                console.log(`Subdomain denied: ${check.error}`);
                ws.send(
                  Protocol.encode({
                    type: "error",
                    code: "SUBDOMAIN_DENIED",
                    message: check.error || "Subdomain not available",
                  }),
                );
                ws.close();
                return;
              } else {
                console.log(`Subdomain check passed: ${check.type}`);
                // Use full hostname for reservation to match later usage
                const fullHostname = `${requestedSubdomain}.${config.baseDomain}`;
                reservationAcquired = await this.router.reserveTunnel(
                  fullHostname,
                  ws,
                  {
                    organizationId,
                    userId,
                    bandwidthLimit,
                    retentionDays,
                    fullCaptureEnabled,
                  },
                  message.forceTakeover || false,
                );

                if (!reservationAcquired) {
                  console.log(
                    `Subdomain ${requestedSubdomain} is currently in use by another tunnel.`,
                  );
                  ws.send(
                    Protocol.encode({
                      type: "error",
                      code: "SUBDOMAIN_IN_USE",
                      message: `Subdomain ${requestedSubdomain} is currently in use. Please try again or use a different subdomain.`,
                    }),
                  );
                  ws.close();
                  return;
                }
              }
            }

            if (!reservationAcquired) {
              let attempts = 0;
              while (!reservationAcquired && attempts < 5) {
                const candidate = generateSubdomain();
                const check = await this.checkSubdomain(candidate);
                if (check.allowed) {
                  const fullHostname = `${candidate}.${config.baseDomain}`;
                  reservationAcquired = await this.router.reserveTunnel(
                    fullHostname,
                    ws,
                    {
                      organizationId,
                      userId,
                      bandwidthLimit,
                      retentionDays,
                      fullCaptureEnabled,
                    },
                  );
                  if (reservationAcquired) {
                    requestedSubdomain = candidate;
                    break;
                  }
                }
                attempts++;
              }

              if (!reservationAcquired) {
                const fallback = generateId("tunnel");
                const fullHostname = `${fallback}.${config.baseDomain}`;
                reservationAcquired = await this.router.reserveTunnel(
                  fullHostname,
                  ws,
                  {
                    organizationId,
                    userId,
                    bandwidthLimit,
                    retentionDays,
                    fullCaptureEnabled,
                  },
                );
                if (reservationAcquired) {
                  requestedSubdomain = fallback;
                }
              }
            }

            if (!reservationAcquired || !requestedSubdomain) {
              ws.send(
                Protocol.encode({
                  type: "error",
                  code: "TUNNEL_UNAVAILABLE",
                  message:
                    "Unable to allocate a tunnel at this time. Please try again.",
                }),
              );
              ws.close();
              return;
            }

            tunnelId = requestedSubdomain;

            // Construct the tunnel URL and full hostname
            const protocol =
              config.baseDomain === "localhost.direct" ? "http" : "https";
            const portSuffix =
              config.baseDomain === "localhost.direct" ? `:${config.port}` : "";
            const fullHostname = `${tunnelId}.${config.baseDomain}`;
            const tunnelUrl = `${protocol}://${fullHostname}${portSuffix}`;

            // Register tunnel in database and check limits
            let dbTunnelId: string | undefined;
            if (userId && organizationId) {
              const result = await this.registerTunnelInDatabase(
                userId,
                organizationId,
                tunnelUrl,
                {
                  name: requestedSubdomain,
                },
              );
              if (!result.success) {
                // Remove the reserved tunnel from Redis since we're rejecting it
                const redis = this.router.getRedis();
                if (redis && organizationId && result.tunnelId) {
                  await redis.srem(
                    `org:${organizationId}:online_tunnels`,
                    result.tunnelId,
                  );
                  await redis.del(`tunnel:last_seen:${result.tunnelId}`);
                  await redis.del(`tunnel:online:${fullHostname}`);
                  // Remove org from global index if no more online tunnels
                  const remaining = await redis.scard(
                    `org:${organizationId}:online_tunnels`,
                  );
                  if (remaining === 0) {
                    await redis.srem(
                      "global:orgs_with_online_tunnels",
                      organizationId,
                    );
                  }
                }

                ws.send(
                  Protocol.encode({
                    type: "error",
                    code: "LIMIT_EXCEEDED",
                    message: result.error || "Failed to register tunnel",
                  }),
                );
                ws.close();
                return;
              }
              dbTunnelId = result.tunnelId;
            }

            // Use full hostname as tunnel ID for consistency
            const registered = await this.router.registerTunnel(
              fullHostname,
              ws,
              {
                organizationId,
                userId,
                dbTunnelId,
                bandwidthLimit,
                retentionDays,
                plan,
                fullCaptureEnabled,
              },
            );

            if (!registered) {
              await this.router.unregisterTunnel(fullHostname, ws);
              tunnelId = null;
              ws.send(
                Protocol.encode({
                  type: "error",
                  code: "TUNNEL_UNAVAILABLE",
                  message: "Unable to persist tunnel reservation.",
                }),
              );
              ws.close();
              return;
            }

            // Update tunnelId to full hostname for message routing
            tunnelId = fullHostname;
            extWs.tunnelId = fullHostname; // Track for heartbeat logging

            const response = Protocol.encode({
              type: "tunnel_opened",
              tunnelId: fullHostname,
              url: tunnelUrl,
              plan,
            });

            ws.send(response);
            console.log(`Tunnel opened: ${fullHostname}`);
          } else if (message.type === "tcp_data" && tunnelId) {
            // Handle TCP data from client (response to external connection)
            const tcpMessage = message as TCPDataMessage;
            const data = Buffer.from(tcpMessage.data, "base64");
            this.tcpProxy.handleClientData(tcpMessage.connectionId, data);
          } else if (message.type === "tcp_close" && tunnelId) {
            // Handle TCP close from client
            const tcpMessage = message as TCPCloseMessage;
            this.tcpProxy.handleClientClose(tcpMessage.connectionId);
          } else if (message.type === "udp_response" && tunnelId) {
            // Handle UDP response from client
            const udpMessage = message as UDPResponseMessage;
            this.udpProxy.handleClientResponse(udpMessage);
          } else if (tunnelId) {
            this.router.handleMessage(tunnelId, message);
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      });

      ws.on("close", (code, reason) => {
        if (tunnelId) {
          // Clean up TCP/UDP tunnels if they exist
          if (this.tcpProxy.hasTunnel(tunnelId)) {
            void this.tcpProxy.closeTunnel(tunnelId);
          }
          if (this.udpProxy.hasTunnel(tunnelId)) {
            void this.udpProxy.closeTunnel(tunnelId);
          }
          void this.router.unregisterTunnel(tunnelId, ws);
          console.log(
            `Tunnel closed: ${tunnelId} (Code: ${code}, Reason: ${reason})`,
          );
          tunnelId = null;
        }
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
      });
    });
  }
}
