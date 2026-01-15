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
import { checkTimescaleDBConnection, shutdownLoggers } from "./lib/tigerdata";

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

const webApiUrl = process.env.WEB_API_URL || "http://localhost:3000/api";
const internalApiSecret = process.env.INTERNAL_API_SECRET;

async function validateDashboardToken(token: string): Promise<{
  valid: boolean;
  orgId?: string;
  userId?: string;
  error?: string;
}> {
  if (!internalApiSecret) {
    console.error("INTERNAL_API_SECRET not configured");
    return { valid: false, error: "Server misconfigured" };
  }

  try {
    const response = await fetch(`${webApiUrl}/dashboard/validate-ws-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalApiSecret}`,
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      let errorMessage = `Failed to validate dashboard token: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json();
        if (errorBody && typeof errorBody.error === "string") {
          errorMessage = errorBody.error;
        }
      } catch {
        // Ignore JSON parsing errors for non-2xx responses
      }
      console.error(
        "Dashboard token validation failed with non-2xx response:",
        errorMessage,
      );
      return { valid: false, error: errorMessage };
    }
    return (await response.json()) as {
      valid: boolean;
      orgId?: string;
      userId?: string;
      error?: string;
    };
  } catch (error) {
    console.error("Failed to validate dashboard token:", error);
    return { valid: false, error: "Internal server error" };
  }
}

wssDashboard.on("connection", async (ws, req) => {
  const url = new URL(req.url || "", "http://localhost");
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(1008, "Authentication token required");
    return;
  }

  // Validate the token with the web API
  const authResult = await validateDashboardToken(token);

  if (!authResult.valid || !authResult.orgId) {
    ws.close(1008, authResult.error || "Authentication failed");
    return;
  }

  console.log(`Dashboard WebSocket authenticated for org: ${authResult.orgId}`);
  logManager.subscribe(authResult.orgId, ws);
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
  await router.shutdown();
  await redis.quit();

  // Flush buffered logs and close database connection
  await shutdownLoggers();

  httpServer.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
