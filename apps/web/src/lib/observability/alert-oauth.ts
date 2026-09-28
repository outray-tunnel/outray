import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { validAlertWebhookUrl, type AlertWebhookChannel } from "../secrets/crypto";

const cookieName = "outray_alert_oauth";
const lifetimeSeconds = 10 * 60;

type OAuthState = {
  nonce: string;
  orgSlug: string;
  organizationId: string;
  alertId: string;
  provider: AlertWebhookChannel;
  userId: string;
  expiresAt: number;
};

export function alertOAuthProvider(value: string): AlertWebhookChannel | null {
  return value === "slack" || value === "discord" ? value : null;
}

export function alertOAuthCredentials(provider: AlertWebhookChannel) {
  const prefix = provider === "slack" ? "OUTRAY_SLACK" : "OUTRAY_DISCORD";
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function alertOAuthCallbackUrl(provider: AlertWebhookChannel) {
  const base = process.env.APP_URL || process.env.BETTER_AUTH_URL;
  if (!base) throw new Error("Alert OAuth application URL is unavailable");
  const url = new URL(base);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("Alert OAuth requires an HTTPS application URL");
  }
  url.pathname = `/api/observability/alerts/integrations/${provider}/callback`;
  url.search = "";
  url.hash = "";
  return url;
}

export function alertNotificationsUrl(orgSlug: string, alertId: string, result: string) {
  const base = process.env.APP_URL || process.env.BETTER_AUTH_URL;
  if (!base) throw new Error("Alert OAuth application URL is unavailable");
  const url = new URL(base);
  url.pathname = `/${encodeURIComponent(orgSlug)}/observability/alerts/${encodeURIComponent(alertId)}/notifications`;
  url.search = new URLSearchParams({ integration: result }).toString();
  url.hash = "";
  return url;
}

export function alertOAuthAuthorizeUrl(
  provider: AlertWebhookChannel,
  clientId: string,
  callbackUrl: URL,
  state: string,
) {
  const url = new URL(provider === "slack"
    ? "https://slack.com/oauth/v2/authorize"
    : "https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl.toString());
  url.searchParams.set("state", state);
  if (provider === "slack") {
    url.searchParams.set("scope", "incoming-webhook");
  } else {
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "webhook.incoming");
    url.searchParams.set("prompt", "consent");
  }
  return url;
}

function stateSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Alert OAuth state secret is unavailable");
  return secret;
}

function cookiePath(provider: AlertWebhookChannel) {
  return `/api/observability/alerts/integrations/${provider}/callback`;
}

export function createAlertOAuthState(input: Omit<OAuthState, "nonce" | "expiresAt"> & {
  secure: boolean;
}) {
  const state: OAuthState = {
    nonce: randomBytes(32).toString("base64url"),
    orgSlug: input.orgSlug,
    organizationId: input.organizationId,
    alertId: input.alertId,
    provider: input.provider,
    userId: input.userId,
    expiresAt: Date.now() + lifetimeSeconds * 1000,
  };
  const serialized = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(serialized).digest("base64url");
  return {
    state: state.nonce,
    cookie: `${cookieName}=${serialized}.${signature}; Path=${cookiePath(input.provider)}; HttpOnly; SameSite=Lax; Max-Age=${lifetimeSeconds}${input.secure ? "; Secure" : ""}`,
  };
}

export function clearAlertOAuthCookie(provider: AlertWebhookChannel, secure: boolean) {
  return `${cookieName}=; Path=${cookiePath(provider)}; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function verifyAlertOAuthState(
  request: Request,
  provider: AlertWebhookChannel,
  nonce: string,
): OAuthState | null {
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
      typeof state.orgSlug === "string" && typeof state.alertId === "string" &&
      typeof state.organizationId === "string" && typeof state.userId === "string" ? state : null;
  } catch {
    return null;
  }
}

export type AlertOAuthDestination = {
  url: string;
  target: {
    workspaceName?: string;
    workspaceId?: string;
    channelName?: string;
    channelId?: string;
    guildId?: string;
    connectedAt: string;
  };
};

export async function exchangeAlertOAuthCode(
  provider: AlertWebhookChannel,
  code: string,
  callbackUrl: URL,
  credentials: { clientId: string; clientSecret: string },
): Promise<AlertOAuthDestination> {
  const form = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code,
    redirect_uri: callbackUrl.toString(),
  });
  if (provider === "discord") form.set("grant_type", "authorization_code");
  const response = await fetch(provider === "slack"
    ? "https://slack.com/api/oauth.v2.access"
    : "https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  if (!response.ok) throw new Error("OAuth token exchange failed");
  const result = await response.json() as Record<string, unknown>;
  if (provider === "slack") {
    const webhook = result.incoming_webhook as Record<string, unknown> | undefined;
    const team = result.team as Record<string, unknown> | undefined;
    if (result.ok !== true || typeof webhook?.url !== "string" ||
      !validAlertWebhookUrl(webhook.url, "slack")) {
      throw new Error("Slack did not return a valid alert destination");
    }
    return {
      url: webhook.url,
      target: {
        workspaceName: safeLabel(team?.name),
        workspaceId: safeLabel(team?.id),
        channelName: safeLabel(webhook.channel),
        channelId: safeLabel(webhook.channel_id),
        connectedAt: new Date().toISOString(),
      },
    };
  }
  const webhook = result.webhook as Record<string, unknown> | undefined;
  if (result.scope !== "webhook.incoming" || typeof webhook?.url !== "string" ||
    !validAlertWebhookUrl(webhook.url, "discord")) {
    throw new Error("Discord did not return a valid alert destination");
  }
  return {
    url: webhook.url,
    target: {
      channelId: safeLabel(webhook.channel_id),
      guildId: safeLabel(webhook.guild_id),
      connectedAt: new Date().toISOString(),
    },
  };
}

function safeLabel(value: unknown) {
  return typeof value === "string" ? value.slice(0, 120) : undefined;
}
