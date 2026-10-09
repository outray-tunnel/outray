import { createServer } from "http";
import Redis from "ioredis";
import { WebSocketServer } from "ws";
import { TunnelRouter } from "./core/TunnelRouter";
import { WSHandler } from "./core/WSHandler";
import { HTTPProxy } from "./core/HTTPProxy";
import { TCPProxy } from "./core/TCPProxy";
import { UDPProxy } from "./core/UDPProxy";
import { WSProxy } from "./core/WSProxy";
import { LogManager } from "./core/LogManager";
import { config } from "./config";
import publicHosts from "../../../shared/public-hosts";
import {
  startTinybirdLoggers,
  shutdownLoggers,
} from "./lib/tinybird";
import {
  closeStatusRouting,
  isActiveStatusCustomDomain,
  isStatusPlatformHost,
  normalizeHost,
  proxyToStatus,
} from "./lib/status-routing";

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

const wsProxy = new WSProxy(router);
const wsHandler = new WSHandler(wssTunnel, router, tcpProxy, udpProxy, wsProxy);

console.log("✅ TCP/UDP tunnel support enabled");
console.log("✅ WebSocket passthrough enabled");

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
        "Authorization": `Bearer ${internalApiSecret}`,
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      let errorMessage = `Failed to validate dashboard token: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json() as { error?: string };
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


  const authResult = await validateDashboardToken(token);

  if (!authResult.valid || !authResult.orgId) {
    ws.close(1008, authResult.error || "Authentication failed");
    return;
  }

  console.log(`Dashboard WebSocket authenticated for org: ${authResult.orgId}`);
  logManager.subscribe(authResult.orgId, ws);
});

httpServer.on("upgrade", (request, socket, head) => {
  void (async () => {
  const host = normalizeHost(request.headers.host);
  const { pathname } = new URL(request.url || "", "http://localhost");

  // Public status pages have no WebSocket endpoint. In particular, never
  // permit a status host to fall through to a tunnel with the same hostname.
  if (isStatusPlatformHost(host)) {
    socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n");
    return;
  }
  if (!host) {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    return;
  }
  try {
    if (await isActiveStatusCustomDomain(host, config.baseDomain.toLowerCase())) {
      socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n");
      return;
    }
  } catch {
    socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
    return;
  }

  if (pathname === "/dashboard/events") {
    wssDashboard.handleUpgrade(request, socket, head, (ws) => {
      wssDashboard.emit("connection", ws, request);
    });
  } else if (publicHosts.isTunnelControlHost(host, config.baseDomain)) {
    // Control plane WebSocket (CLI clients connecting)
    wssTunnel.handleUpgrade(request, socket, head, (ws) => {
      wssTunnel.emit("connection", ws, request);
    });
  } else {
    // End-user WebSocket to a tunneled subdomain
    wsProxy.handleUpgrade(request, socket, head);
  }
  })();
});

httpServer.on("request", async (req, res) => {
  const host = normalizeHost(req.headers.host);
  const url = new URL(req.url || "", "http://localhost");

  if (!host) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Invalid Host");
    return;
  }
  if (isStatusPlatformHost(host)) {
    proxyToStatus(req, res);
    return;
  }
  try {
    if (await isActiveStatusCustomDomain(host, config.baseDomain.toLowerCase())) {
      proxyToStatus(req, res);
      return;
    }
  } catch {
    res.writeHead(503, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    res.end("Host routing temporarily unavailable");
    return;
  }
  
  // Health check endpoint — only for the tunnel server itself, not tunneled subdomains
  const cleanHost = host;
  const isBaseDomain = publicHosts.isTunnelControlHost(cleanHost, config.baseDomain);
  
  if (url.pathname === "/health" && isBaseDomain) {
    const redisStatus = redis.status === "ready" ? "healthy" : "unhealthy";
    const isHealthy = redisStatus === "healthy";
    
    res.writeHead(isHealthy ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      services: {
        redis: redisStatus,
        websocket: wssTunnel.clients.size >= 0 ? "healthy" : "unhealthy",
      },
      stats: {
        activeTunnels: wssTunnel.clients.size,
        dashboardConnections: wssDashboard.clients.size,
      },
    }));
    return;
  }
  
  if (publicHosts.isTunnelControlHost(host, config.baseDomain) && host !== config.baseDomain.toLowerCase() && host !== "localhost") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", version: "1.0.0" }));
    return;
  }
  proxy.handleRequest(req, res);
});

httpServer.listen(config.port, config.bindHost, () => {
  console.log(`OutRay Server running on ${config.bindHost}:${config.port}`);
  console.log(`Base domain: ${config.baseDomain}`);
  startTinybirdLoggers();
});

const shutdown = async () => {
  console.log("Shutting down tunnel server...");
  wsHandler.shutdown();
  await router.shutdown();
  await closeStatusRouting();
  
  // Persist buffered analytics before stopping; Redis owns queued deliveries.
  try {
    await shutdownLoggers();
  } catch {
    console.error("Tunnel analytics shutdown failed; some buffered records were not persisted");
  }
  await redis.quit();
  
  httpServer.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
