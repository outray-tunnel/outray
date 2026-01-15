import { redis } from "./redis";

interface RateLimitConfig {
  identifier: string;
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  resetIn: number;
  remaining: number;
}

// Atomic Lua script for sliding window rate limiting
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowStart = tonumber(ARGV[2])
local maxRequests = tonumber(ARGV[3])
local windowSeconds = tonumber(ARGV[4])
local requestId = ARGV[5]

redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
local currentCount = redis.call('ZCARD', key)

local allowed = 0
if currentCount < maxRequests then
  redis.call('ZADD', key, now, requestId)
  allowed = 1
  currentCount = currentCount + 1
end

redis.call('EXPIRE', key, windowSeconds + 1)

local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local oldestTimestamp = 0
if oldest and oldest[2] then
  oldestTimestamp = tonumber(oldest[2])
end

return {allowed, currentCount, oldestTimestamp}
`;

export async function rateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const windowStart = now - windowMs;
  const redisKey = `ratelimit:${config.identifier}:${key}`;
  const requestId = `${now}-${Math.random().toString(36).substring(2)}`;

  try {
    const result = (await redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      redisKey,
      now.toString(),
      windowStart.toString(),
      config.maxRequests.toString(),
      config.windowSeconds.toString(),
      requestId,
    )) as [number, number, number];

    const [allowed, currentCount, oldestTimestamp] = result;

    let resetIn = config.windowSeconds;
    if (oldestTimestamp > 0) {
      const oldestExpiry = oldestTimestamp + windowMs;
      resetIn = Math.max(1, Math.ceil((oldestExpiry - now) / 1000));
    }

    return {
      allowed: allowed === 1,
      current: currentCount,
      limit: config.maxRequests,
      resetIn,
      remaining: Math.max(0, config.maxRequests - currentCount),
    };
  } catch (error) {
    console.error("Rate limit error:", error);
    return {
      allowed: true,
      current: 0,
      limit: config.maxRequests,
      resetIn: config.windowSeconds,
      remaining: config.maxRequests,
    };
  }
}

// Auto-detect trusted proxy by checking for known proxy headers
export function getClientIdentifier(request: Request): string {
  // Cloudflare - most reliable, can't be spoofed when behind CF
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return sanitizeIp(cfIp);

  // Vercel
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp) return sanitizeIp(vercelIp.split(",")[0].trim());

  // Fly.io
  const flyIp = request.headers.get("fly-client-ip");
  if (flyIp) return sanitizeIp(flyIp);

  // Railway, Render, etc. set x-real-ip properly
  const realIp = request.headers.get("x-real-ip");
  if (realIp && !isPrivateIp(realIp)) return sanitizeIp(realIp);

  // X-Forwarded-For - use rightmost non-private IP (set by proxy, not client)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((ip) => ip.trim());
    for (let i = ips.length - 1; i >= 0; i--) {
      if (!isPrivateIp(ips[i])) {
        return sanitizeIp(ips[i]);
      }
    }
  }

  return "unidentified";
}

function sanitizeIp(ip: string): string {
  return ip.replace(/[^a-zA-Z0-9.:%-]/g, "").substring(0, 100);
}

function isPrivateIp(ip: string): boolean {
  return (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("127.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.20.") ||
    ip.startsWith("172.21.") ||
    ip.startsWith("172.22.") ||
    ip.startsWith("172.23.") ||
    ip.startsWith("172.24.") ||
    ip.startsWith("172.25.") ||
    ip.startsWith("172.26.") ||
    ip.startsWith("172.27.") ||
    ip.startsWith("172.28.") ||
    ip.startsWith("172.29.") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.") ||
    ip === "::1" ||
    ip.startsWith("fe80:") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}

export function createRateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      retryAfter: result.resetIn,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": result.resetIn.toString(),
        "Retry-After": result.resetIn.toString(),
      },
    },
  );
}

export const rateLimiters = {
  cliLogin: (key: string) =>
    rateLimit(key, {
      identifier: "cli-login",
      maxRequests: 10,
      windowSeconds: 60,
    }),

  cliLoginStatus: (key: string) =>
    rateLimit(key, {
      identifier: "cli-login-status",
      maxRequests: 60,
      windowSeconds: 60,
    }),

  tunnelAuth: (key: string) =>
    rateLimit(key, {
      identifier: "tunnel-auth",
      maxRequests: 30,
      windowSeconds: 60,
    }),

  tunnelRegister: (key: string) =>
    rateLimit(key, {
      identifier: "tunnel-register",
      maxRequests: 20,
      windowSeconds: 60,
    }),

  tokenExchange: (key: string) =>
    rateLimit(key, {
      identifier: "token-exchange",
      maxRequests: 20,
      windowSeconds: 60,
    }),

  general: (key: string) =>
    rateLimit(key, {
      identifier: "general",
      maxRequests: 100,
      windowSeconds: 60,
    }),
};
