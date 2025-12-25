import WebSocket, { WebSocketServer } from "ws";
import { Server as HTTPServer } from "http";
import { TunnelRouter } from "./TunnelRouter";
import { Protocol, Message } from "./Protocol";
import { generateId, generateSubdomain } from "../../../../shared/utils";
import { config } from "../config";

export class WSHandler {
  private wss: WebSocketServer;
  private router: TunnelRouter;
  private webApiUrl: string;

  constructor(wss: WebSocketServer, router: TunnelRouter) {
    this.router = router;
    this.wss = wss;
    this.webApiUrl = process.env.WEB_API_URL || "http://localhost:3000/api";
    this.setupWebSocketServer();
  }

  private async validateAuthToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    organizationId?: string;
    organization?: any;
    error?: string;
    tokenType?: "legacy" | "org";
    bandwidthLimit?: number;
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
  ): Promise<string | null> {
    try {
      const response = await fetch(`${this.webApiUrl}/tunnel/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          organizationId,
          url,
        }),
      });
      const data = (await response.json()) as {
        success: boolean;
        tunnelId?: string;
      };
      return data.tunnelId || null;
    } catch (error) {
      console.error("Failed to register tunnel in database:", error);
      return null;
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
              console.log(
                `Authenticated organization: ${authResult.organization?.name}`,
              );
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
              const tunnelUrl = `https://${message.customDomain}`;

              // Register tunnel in database
              let dbTunnelId: string | undefined;
              if (userId && organizationId) {
                const id = await this.registerTunnelInDatabase(
                  userId,
                  organizationId,
                  tunnelUrl,
                );
                if (id) dbTunnelId = id;
              }

              const registered = await this.router.registerTunnel(
                tunnelId,
                ws,
                {
                  organizationId,
                  userId,
                  dbTunnelId,
                  bandwidthLimit,
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
                reservationAcquired = await this.router.reserveTunnel(
                  requestedSubdomain,
                  {
                    organizationId,
                    userId,
                    bandwidthLimit,
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
                  reservationAcquired = await this.router.reserveTunnel(
                    candidate,
                    {
                      organizationId,
                      userId,
                      bandwidthLimit,
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
                reservationAcquired = await this.router.reserveTunnel(
                  fallback,
                  {
                    organizationId,
                    userId,
                    bandwidthLimit,
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

            let dbTunnelId: string | undefined;
            if (userId && organizationId) {
              const id = await this.registerTunnelInDatabase(
                userId,
                organizationId,
                tunnelUrl,
              );
              if (id) dbTunnelId = id;
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

            const response = Protocol.encode({
              type: "tunnel_opened",
              tunnelId: fullHostname,
              url: tunnelUrl,
            });

            ws.send(response);
            console.log(`Tunnel opened: ${fullHostname}`);
          } else if (tunnelId) {
            this.router.handleMessage(tunnelId, message);
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      });

      ws.on("close", (code, reason) => {
        if (tunnelId) {
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
