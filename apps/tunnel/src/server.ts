import { createServer } from "http";
import Redis from "ioredis";
import { WebSocketServer } from "ws";
import { TunnelRouter } from "./core/TunnelRouter";
import { WSHandler } from "./core/WSHandler";
import { HTTPProxy } from "./core/HTTPProxy";
import { TCPProxy } from "./core/TCPProxy";
import { UDPProxy } from "./core/UDPProxy";
import { LogManager } from "./core/LogManager";
import { config } from "./config";
import {
  checkTimescaleDBConnection,
  shutdownLoggers,
} from "./lib/tigerdata";

const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
});

const subRedis = new Redis(config.redisUrl, {
  lazyConnect: true,
});

redis.on("error", (error) => {
  console.error("Redis connection error", error);
});

subRedis.on("error", (error) => {
  console.error("Redis subscription connection error", error);
});

void redis
  .connect()
  .then(() => {
    console.log("Connected to Redis");
  })
  .catch((error) => {
    console.error("Failed to connect to Redis", error);
    process.exit(1);
  });

void subRedis.connect().catch((error) => {
  console.error("Failed to connect to Redis (subscriber)", error);
});

const router = new TunnelRouter({
  redis,
  subRedis,
  ttlSeconds: config.redisTunnelTtlSeconds,
  heartbeatIntervalMs: config.redisHeartbeatIntervalMs,
  requestTimeoutMs: config.requestTimeoutMs,
});
const httpServer = createServer();
const logManager = new LogManager();
const proxy = new HTTPProxy(router, config.baseDomain, logManager);

console.log("🚨 BASE DOMAIN LOADED:", config.baseDomain);

const wssTunnel = new WebSocketServer({ noServer: true });
const wssDashboard = new WebSocketServer({ noServer: true });

// Create TCP and UDP proxies with Redis for bandwidth tracking
const tcpProxy = new TCPProxy(
  config.tcpPortRangeMin,
  config.tcpPortRangeMax,
  redis,
);
const udpProxy = new UDPProxy(
  config.udpPortRangeMin,
  config.udpPortRangeMax,
  redis,
);

const wsHandler = new WSHandler(wssTunnel, router, tcpProxy, udpProxy);

console.log("✅ TCP/UDP tunnel support enabled");

/**
 * Validate that a token has access to the specified organization.
 * Supports two token types:
 * 1. Dashboard WebSocket tokens (short-lived, stored in Redis) - for web dashboard users
 * 2. CLI org tokens (validated via /api/tunnel/auth) - for CLI users
 */
async function validateDashboardAccess(
  token: string,
  orgId: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // First, try to validate as a dashboard WebSocket token (stored in Redis)
    const dashboardTokenKey = `dashboard:ws:${token}`;
    const dashboardTokenData = await redis.get(dashboardTokenKey);

    if (dashboardTokenData) {
      try {
        const tokenInfo = JSON.parse(dashboardTokenData) as {
          organizationId: string;
          userId: string;
          createdAt: number;
        };

        // Verify the token's organization matches the requested orgId
        if (tokenInfo.organizationId !== orgId) {
          return { valid: false, error: "Access denied to this organization" };
        }

        // Token is valid - optionally delete it for one-time use
        // await redis.del(dashboardTokenKey);

        return { valid: true };
      } catch (parseError) {
        console.error("Failed to parse dashboard token data:", parseError);
      }
    }

    // Fall back to CLI org token validation via API
    const response = await fetch(`${config.webApiUrl}/tunnel/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return { valid: false, error: "Authentication failed" };
    }

    const result = (await response.json()) as {
      valid: boolean;
      organizationId?: string;
      error?: string;
    };

    if (!result.valid) {
      return { valid: false, error: result.error || "Invalid token" };
    }

    // Verify the token's organization matches the requested orgId
    if (result.organizationId !== orgId) {
      return { valid: false, error: "Access denied to this organization" };
    }

    return { valid: true };
  } catch (error) {
    console.error("Dashboard auth validation error:", error);
    return { valid: false, error: "Authentication service unavailable" };
  }
}

wssDashboard.on("connection", async (ws, req) => {
  const url = new URL(req.url || "", "http://localhost");
  const orgId = url.searchParams.get("orgId");
  const token = url.searchParams.get("token");

  if (!orgId) {
    ws.close(1008, "Organization ID required");
    return;
  }

  if (!token) {
    ws.close(1008, "Authentication token required");
    return;
  }

  // Validate the token has access to this organization
  const authResult = await validateDashboardAccess(token, orgId);
  if (!authResult.valid) {
    console.log(`Dashboard access denied for org ${orgId}: ${authResult.error}`);
    ws.close(1008, authResult.error || "Unauthorized");
    return;
  }

  logManager.subscribe(orgId, ws);
});

httpServer.on("upgrade", (request, socket, head) => {
  const { pathname } = new URL(request.url || "", "http://localhost");

  if (pathname === "/dashboard/events") {
    wssDashboard.handleUpgrade(request, socket, head, (ws) => {
      wssDashboard.emit("connection", ws, request);
    });
  } else {
    wssTunnel.handleUpgrade(request, socket, head, (ws) => {
      wssTunnel.emit("connection", ws, request);
    });
  }
});

httpServer.on("request", (req, res) => {
  const host = req.headers.host || "";
  if (host.startsWith("api.")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", version: "1.0.0" }));
    return;
  }
  proxy.handleRequest(req, res);
});

httpServer.listen(config.port, () => {
  console.log(`OutRay Server running on port ${config.port}`);
  console.log(`Base domain: ${config.baseDomain}`);
  void checkTimescaleDBConnection();
});

const shutdown = async () => {
  console.log("Shutting down tunnel server...");
  wsHandler.shutdown();
  logManager.shutdown();
  await router.shutdown();
  await redis.quit();

  // Flush buffered logs and close database connection
  await shutdownLoggers();

  httpServer.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
