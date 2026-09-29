const DEFAULT_PUBLIC_URL = "https://status.outray.app";
export const STATUS_PAGE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export interface StatusConfig {
  publicUrl: URL;
  canonicalHost: string;
  databaseUrl: string;
  zeptoApiKey: string;
  fromEmail: string;
  rateLimitSecret: string;
  unsubscribeSecret: string;
  edgeSecret: string;
  enabled: boolean;
}

export function getStatusConfig(): StatusConfig {
  const publicUrl = new URL(process.env.OUTRAY_STATUS_URL ||
    (process.env.NODE_ENV !== "production" ? process.env.STATUS_PUBLIC_URL : undefined) ||
    DEFAULT_PUBLIC_URL);
  if (publicUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("OUTRAY_STATUS_URL must use HTTPS in production");
  }
  if (process.env.NODE_ENV === "production" && !process.env.OUTRAY_STATUS_URL) {
    throw new Error("OUTRAY_STATUS_URL is required in production");
  }
  if (publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) {
    throw new Error("OUTRAY_STATUS_URL must be an origin without a path or query");
  }
  return {
    publicUrl,
    canonicalHost: publicUrl.hostname.toLowerCase(),
    databaseUrl: process.env.DATABASE_URL || "",
    zeptoApiKey: process.env.ZEPTO_API_KEY || "",
    fromEmail: process.env.ZEPTO_FROM_EMAIL || "no-reply@outray.dev",
    rateLimitSecret: process.env.UPTIME_RATE_LIMIT_SECRET || "",
    unsubscribeSecret: process.env.UPTIME_UNSUBSCRIBE_SECRET || "",
    edgeSecret: process.env.STATUS_EDGE_SECRET || "",
    enabled: process.env.UPTIME_ENABLED !== "false",
  };
}

export function statusPageUrl(
  slug: string,
  config: Pick<StatusConfig, "publicUrl" | "canonicalHost"> = getStatusConfig(),
): URL {
  if (!STATUS_PAGE_SLUG.test(slug)) throw new Error("Invalid status page slug");
  const url = new URL(config.publicUrl);
  url.hostname = `${slug}.${config.canonicalHost}`;
  return url;
}

export function requireProductionSecrets(config: StatusConfig): void {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required");
  if (process.env.NODE_ENV === "production" && !config.rateLimitSecret) {
    throw new Error("UPTIME_RATE_LIMIT_SECRET is required in production");
  }
  if (process.env.NODE_ENV === "production" && !config.unsubscribeSecret) {
    throw new Error("UPTIME_UNSUBSCRIBE_SECRET is required in production");
  }
  if (process.env.NODE_ENV === "production" && !config.edgeSecret) {
    throw new Error("STATUS_EDGE_SECRET is required in production");
  }
}
