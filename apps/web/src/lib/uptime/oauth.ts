import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { AlertWebhookChannel } from "@/lib/secrets/crypto";

const cookieName = "outray_uptime_oauth";
const lifetimeSeconds = 600;

type OAuthState = {
  nonce: string;
  orgSlug: string;
  organizationId: string;
  provider: AlertWebhookChannel;
  userId: string;
  expiresAt: number;
};

function stateSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Uptime OAuth state secret is unavailable");
  return secret;
}

export function dashboardBaseUrl() {
  const configured = process.env.OUTRAY_DASHBOARD_URL?.trim();
  if (process.env.NODE_ENV === "production" && !configured) {
    throw new Error("OUTRAY_DASHBOARD_URL must be configured in production");
  }
  const base = configured || process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:6767";
  const url = new URL(base);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("Uptime OAuth dashboard URL must use HTTPS");
  }
  return url;
}

function cookiePath(provider: AlertWebhookChannel) {
  return `/api/uptime/integrations/${provider}/callback`;
}

export function uptimeOAuthCallbackUrl(provider: AlertWebhookChannel) {
  const url = dashboardBaseUrl();
  url.pathname = cookiePath(provider);
  url.search = "";
  url.hash = "";
  return url;
}

export function uptimeIntegrationReturnUrl(orgSlug: string, result: string) {
  const url = dashboardBaseUrl();
  url.pathname = `/${encodeURIComponent(orgSlug)}/uptime/monitors`;
  url.search = new URLSearchParams({ integration: result }).toString();
  url.hash = "";
  return url;
}

export function createUptimeOAuthState(input: Omit<OAuthState, "nonce" | "expiresAt">, secure: boolean) {
  const state: OAuthState = {
    ...input,
    nonce: randomBytes(32).toString("base64url"),
    expiresAt: Date.now() + lifetimeSeconds * 1_000,
  };
  const serialized = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(serialized).digest("base64url");
  return {
    nonce: state.nonce,
    cookie: `${cookieName}=${serialized}.${signature}; Path=${cookiePath(input.provider)}; HttpOnly; SameSite=Lax; Max-Age=${lifetimeSeconds}${secure ? "; Secure" : ""}`,
  };
}

export function clearUptimeOAuthCookie(provider: AlertWebhookChannel, secure: boolean) {
  return `${cookieName}=; Path=${cookiePath(provider)}; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function verifyUptimeOAuthState(request: Request, provider: AlertWebhookChannel, nonce: string): OAuthState | null {
  const raw = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!raw) return null;
  const [serialized, signature] = raw.split(".");
  if (!serialized || !signature) return null;
  const actual = Buffer.from(signature, "base64url");
  const correct = createHmac("sha256", stateSecret()).update(serialized).digest();
  if (actual.length !== correct.length || !timingSafeEqual(actual, correct)) return null;
  try {
    const state = JSON.parse(Buffer.from(serialized, "base64url").toString("utf8")) as OAuthState;
    return state.nonce === nonce && state.provider === provider && state.expiresAt > Date.now() &&
      typeof state.orgSlug === "string" && typeof state.organizationId === "string" &&
      typeof state.userId === "string" ? state : null;
  } catch { return null; }
}
