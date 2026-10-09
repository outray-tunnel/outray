/** Host-neutral, server-side installation policy. Never send the allowlist to clients. */
export const INSTANCE_PRODUCTS = ["tunnels", "observability", "secrets", "uptime"] as const;
export type InstanceProduct = (typeof INSTANCE_PRODUCTS)[number];
type Environment = Record<string, string | undefined>;
const runtimeEnvironment = (): Environment => typeof process === "undefined" ? {} : process.env;

export function instanceConfig(env: Environment = runtimeEnvironment()) {
  const mode = env.OUTRAY_DEPLOYMENT_MODE || "hosted";
  if (mode !== "hosted" && mode !== "self-hosted") {
    throw new Error("OUTRAY_DEPLOYMENT_MODE must be hosted or self-hosted");
  }
  const selfHosted = mode === "self-hosted";
  const products = env.OUTRAY_PRODUCTS === undefined
    ? [...INSTANCE_PRODUCTS]
    : env.OUTRAY_PRODUCTS.split(",").map((item) => item.trim()).filter(Boolean);
  if (products.some((item) => !INSTANCE_PRODUCTS.includes(item as InstanceProduct))) {
    throw new Error("OUTRAY_PRODUCTS contains an unknown product");
  }
  const retentionDays = Number(env.OUTRAY_RETENTION_DAYS || 30);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 90) {
    throw new Error("OUTRAY_RETENTION_DAYS must be an integer from 1 to 90");
  }
  return {
    selfHosted,
    products: [...new Set(products)] as InstanceProduct[],
    billingEnabled: !selfHosted,
    marketingEnabled: !selfHosted,
    retentionDays,
    limits: Object.fromEntries([
      ["maxTunnels", "OUTRAY_MAX_TUNNELS"], ["maxDomains", "OUTRAY_MAX_DOMAINS"],
      ["maxSubdomains", "OUTRAY_MAX_SUBDOMAINS"], ["maxMembers", "OUTRAY_MAX_MEMBERS"],
      ["bandwidthPerMonth", "OUTRAY_BANDWIDTH_BYTES_PER_MONTH"],
      ["maxUptimeMonitors", "OUTRAY_MAX_UPTIME_MONITORS"],
      ["maxObservabilityAlerts", "OUTRAY_MAX_OBSERVABILITY_ALERTS"],
    ].map(([key, variable]) => {
      const fallback = key === "bandwidthPerMonth" ? 1024 ** 5
        : key === "maxUptimeMonitors" || key === "maxObservabilityAlerts" ? 1_000 : 999_999_999;
      const value = Number(env[variable] || fallback);
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${variable} must be a positive safe integer`);
      return [key, value];
    })) as Record<"maxTunnels" | "maxDomains" | "maxSubdomains" | "maxMembers" | "bandwidthPerMonth" | "maxUptimeMonitors" | "maxObservabilityAlerts", number>,
  };
}

export function instanceSignupAllowed(
  user: { email: string; emailVerified?: boolean },
  env: Environment = runtimeEnvironment(),
) {
  if (!instanceConfig(env).selfHosted) return true;
  // Fail closed, including OAuth identities without a verified email address.
  if (user.emailVerified !== true) return false;
  const email = user.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false;
  const addresses = (env.OUTRAY_SIGNUP_ALLOWED_EMAILS || "")
    .split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const domains = (env.OUTRAY_SIGNUP_ALLOWED_DOMAINS || "")
    .split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return addresses.includes(email) || domains.some((allowed) =>
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(allowed) && allowed === domain,
  );
}

/** Match both dashboard paths and APIs, including CLI and legacy tunnel aliases. */
export function instanceProductForPath(pathname: string): InstanceProduct | null {
  const parts = pathname.split("/").filter(Boolean);
  const api = parts[0] === "api";
  const segment = parts[api ? 2 : 1];
  if (api && parts[1] === "tunnel") return "tunnels";
  if (["tunnel", "tunnels", "requests", "subdomains", "domains", "stats"].includes(segment)) return "tunnels";
  if (INSTANCE_PRODUCTS.includes(segment as InstanceProduct)) return segment as InstanceProduct;
  return null;
}

export function instancePathAvailable(pathname: string, env: Environment = runtimeEnvironment()) {
  const config = instanceConfig(env);
  const product = instanceProductForPath(pathname);
  if (product && !config.products.includes(product)) return false;
  if (!config.billingEnabled && (
    /^\/api\/(?:checkout|webhooks\/(?:polar|paystack)|subscriptions)(?:\/|$)/.test(pathname) ||
    /^\/api\/admin\/(?:subscriptions|revenue-history)(?:\/|$)/.test(pathname) ||
    /^\/[^/]+\/billing(?:\/|$)/.test(pathname)
  )) return false;
  return true;
}

// Dual ESM/CommonJS consumers (tsx development and bundled Node workers).
export default { instanceConfig, instanceSignupAllowed, instanceProductForPath, instancePathAvailable };
