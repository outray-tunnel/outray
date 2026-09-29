import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { getStatusConfig } from "./config";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashRateKey(kind: "ip" | "email", value: string): string {
  const secret = getStatusConfig().rateLimitSecret;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("UPTIME_RATE_LIMIT_SECRET is required");
  }
  return createHmac("sha256", secret || "local-development-only")
    .update(`${kind}:${value}`)
    .digest("hex");
}

export function makeUnsubscribeToken(subscriberId: string, pageId: string, expiresAt: number): string {
  const payload = `${subscriberId}.${pageId}.${expiresAt}`;
  const signature = signUnsubscribe(payload);
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

export function verifyUnsubscribeToken(token: string): { subscriberId: string; pageId: string } | null {
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature || token.length > 1024 ||
      !/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[0-9a-f]{64}$/.test(suppliedSignature)) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = signUnsubscribe(payload);
  const supplied = Buffer.from(suppliedSignature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  if (supplied.length !== expectedBytes.length || !timingSafeEqual(supplied, expectedBytes)) return null;
  const [subscriberId, pageId, rawExpiry, extra] = payload.split(".");
  const expiry = Number(rawExpiry);
  if (extra || !subscriberId || !pageId || !Number.isFinite(expiry) || expiry < Date.now()) return null;
  return { subscriberId, pageId };
}

function signUnsubscribe(payload: string): string {
  const secret = getStatusConfig().unsubscribeSecret;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("UPTIME_UNSUBSCRIBE_SECRET is required");
  }
  return createHmac("sha256", secret || "local-development-only")
    .update(`unsubscribe:${payload}`)
    .digest("hex");
}

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function safeClientIp(request: Request, clientAddress?: string): string {
  // Only trust an address constructed by the edge, never client-supplied X-Forwarded-For.
  const configured = process.env.STATUS_EDGE_SECRET;
  const supplied = request.headers.get("x-outray-edge-secret");
  if (configured && supplied === configured) {
    const edgeIp = request.headers.get("x-outray-client-ip")?.trim() || "";
    if (isIP(edgeIp)) return edgeIp;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Trusted client IP unavailable");
  }
  return clientAddress || "unknown";
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const expectedHost = request.headers.get("host") || new URL(request.url).host;
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host.toLowerCase() === expectedHost.toLowerCase() &&
      (parsedOrigin.protocol === "https:" || process.env.NODE_ENV !== "production");
  } catch {
    return false;
  }
}
