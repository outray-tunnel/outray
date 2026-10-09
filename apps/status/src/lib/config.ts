import publicHosts from "../../../../shared/public-hosts";
import instancePolicy from "../../../../shared/instance-config";
export const STATUS_PAGE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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
  const publicUrl = publicHosts.statusPublicOrigin();
  if (publicUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("STATUS_PUBLIC_URL or OUTRAY_STATUS_URL must use HTTPS in production");
  }
  if (process.env.NODE_ENV === "production" && !process.env.OUTRAY_STATUS_URL && !process.env.STATUS_PUBLIC_URL) {
    throw new Error("STATUS_PUBLIC_URL or OUTRAY_STATUS_URL is required in production");
  }
  return {
    publicUrl,
    canonicalHost: publicUrl.hostname.toLowerCase().replace(/\.$/, ""),
    databaseUrl: process.env.DATABASE_URL || "",
    zeptoApiKey: process.env.ZEPTO_API_KEY || "",
    fromEmail: process.env.ZEPTO_FROM_EMAIL || (instancePolicy.instanceConfig().selfHosted ? "" : "no-reply@outray.dev"),
    rateLimitSecret: process.env.UPTIME_RATE_LIMIT_SECRET || "",
    unsubscribeSecret: process.env.UPTIME_UNSUBSCRIBE_SECRET || "",
    edgeSecret: process.env.STATUS_EDGE_SECRET || "",
    enabled: process.env.UPTIME_ENABLED !== "false" && instancePolicy.instanceConfig().products.includes("uptime"),
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
