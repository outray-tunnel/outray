import "dotenv/config";

export const config = {
  port: parseInt(process.env.PORT || "3547", 10),
  baseDomain: process.env.BASE_DOMAIN || "localhost.direct",
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  redisTunnelTtlSeconds: parseInt(
    process.env.REDIS_TUNNEL_TTL_SECONDS || "120",
    10,
  ),
  redisHeartbeatIntervalMs: parseInt(
    process.env.REDIS_HEARTBEAT_INTERVAL_MS || "20000",
    10,
  ),
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || "60000", 10),
  tigerDataUrl:
    process.env.TIMESCALE_URL || "postgresql://localhost:5432/outray",
  // TCP/UDP port ranges
  tcpPortRangeMin: parseInt(process.env.TCP_PORT_RANGE_MIN || "20000", 10),
  tcpPortRangeMax: parseInt(process.env.TCP_PORT_RANGE_MAX || "30000", 10),
  udpPortRangeMin: parseInt(process.env.UDP_PORT_RANGE_MIN || "30001", 10),
  udpPortRangeMax: parseInt(process.env.UDP_PORT_RANGE_MAX || "40000", 10),
};
