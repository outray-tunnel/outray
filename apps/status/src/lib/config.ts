import publicHosts from "../../../../shared/public-hosts";
import instancePolicy from "../../../../shared/instance-config";
import { getStatusRuntime, isStatusProduction, statusEnvironment } from "./runtime";
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
  const environment = statusEnvironment();
  const policy = instancePolicy.instanceConfig(environment);
  const publicUrl = publicHosts.statusPublicOrigin(environment);
  if (publicUrl.protocol !== "https:" && isStatusProduction()) {
    throw new Error("STATUS_PUBLIC_URL or OUTRAY_STATUS_URL must use HTTPS in production");
  }
  if (isStatusProduction() && !environment.OUTRAY_STATUS_URL && !environment.STATUS_PUBLIC_URL) {
    throw new Error("STATUS_PUBLIC_URL or OUTRAY_STATUS_URL is required in production");
  }
  return {
    publicUrl,
    canonicalHost: publicUrl.hostname.toLowerCase().replace(/\.$/, ""),
    databaseUrl: getStatusRuntime()?.env.HYPERDRIVE?.connectionString || environment.DATABASE_URL || "",
    zeptoApiKey: environment.ZEPTO_API_KEY || "",
    fromEmail: environment.ZEPTO_FROM_EMAIL || (policy.selfHosted ? "" : "no-reply@outray.co"),
    rateLimitSecret: environment.UPTIME_RATE_LIMIT_SECRET || "",
    unsubscribeSecret: environment.UPTIME_UNSUBSCRIBE_SECRET || "",
    edgeSecret: environment.STATUS_EDGE_SECRET || "",
    enabled: environment.UPTIME_ENABLED !== "false" && policy.products.includes("uptime"),
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
  if (isStatusProduction() && !config.rateLimitSecret) {
    throw new Error("UPTIME_RATE_LIMIT_SECRET is required in production");
  }
  if (isStatusProduction() && !config.unsubscribeSecret) {
    throw new Error("UPTIME_UNSUBSCRIBE_SECRET is required in production");
  }
  if (isStatusProduction() && !getStatusRuntime() && !config.edgeSecret) {
    throw new Error("STATUS_EDGE_SECRET is required in production");
  }
}
