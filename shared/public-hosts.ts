/** Public routing configuration only. Safe to import in dashboard clients when
 * an explicit build-time environment is supplied; never exposes credentials. */
export type PublicHostEnvironment = Readonly<Record<string, string | undefined>>;
const environment = (): PublicHostEnvironment => typeof process === "undefined" ? {} : process.env;

export function normalizePublicHostname(value: string): string | null {
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (host.length > 253 || !host.split(".").every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
  )) return null;
  return host;
}

export function publicOrigin(value: string, variable: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash || !normalizePublicHostname(url.hostname)) {
    throw new Error(`${variable} must be an HTTP(S) origin without credentials, a path or query`);
  }
  return url;
}

export function statusPublicOrigin(env: PublicHostEnvironment = environment()): URL {
  return publicOrigin(env.OUTRAY_STATUS_URL || env.STATUS_PUBLIC_URL || "https://status.outray.app", "STATUS_PUBLIC_URL");
}

export function canonicalStatusHostname(env: PublicHostEnvironment = environment()): string {
  return statusPublicOrigin(env).hostname.toLowerCase().replace(/\.$/, "");
}

export function tunnelBaseDomain(env: PublicHostEnvironment = environment(), fallback = "outray.app"): string {
  const host = normalizePublicHostname(env.BASE_DOMAIN || fallback);
  if (!host) throw new Error("BASE_DOMAIN must be a hostname without a scheme or port");
  return host;
}

export function infrastructureHostnames(env: PublicHostEnvironment = environment()): string[] {
  const base = tunnelBaseDomain(env);
  const hosts = new Set([base, `www.${base}`, `edge.${base}`, `api.${base}`, canonicalStatusHostname(env)]);
  if (env.OUTRAY_DEPLOYMENT_MODE !== "self-hosted") {
    hosts.add("connect.outray.co");
    hosts.add("api.outray.co");
    hosts.add("api.outray.dev");
  }
  for (const variable of ["CONSOLE_PUBLIC_URL", "APP_URL", "BETTER_AUTH_URL", "TUNNEL_PUBLIC_URL", "INGEST_PUBLIC_URL", "OUTRAY_INGEST_URL", "OUTRAY_SHARE_URL", "SHARE_PUBLIC_URL"]) {
    if (env[variable]) hosts.add(publicOrigin(env[variable]!, variable).hostname.toLowerCase());
  }
  return [...hosts];
}

export function isReservedStatusCustomDomain(host: string, env: PublicHostEnvironment = environment()): boolean {
  const hostname = normalizePublicHostname(host);
  if (!hostname) return true;
  const namespace = (base: string) => hostname === base || hostname.endsWith(`.${base}`);
  if (namespace(canonicalStatusHostname(env))) return true;
  if (env.OUTRAY_DEPLOYMENT_MODE !== "self-hosted") return namespace("outray.app") || namespace("outray.dev");
  return infrastructureHostnames(env).some(namespace);
}

/** DNS instructions can derive a hostname from the same ws(s) URL used by the
 * dashboard feed, without shipping runtime environment variables to clients. */
export function tunnelDnsHostname(value?: string): string {
  if (!value) return "edge.outray.app";
  const url = new URL(value);
  if (!["https:", "http:", "wss:", "ws:"].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || !normalizePublicHostname(url.hostname)) throw new Error("VITE_TUNNEL_URL must be a public HTTP(S) or WebSocket URL");
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

export function isTunnelControlHost(host: string, base: string, env: PublicHostEnvironment = environment()): boolean {
  if (host === base.toLowerCase() || host === "localhost") return true;
  if (env.TUNNEL_PUBLIC_URL && host === publicOrigin(env.TUNNEL_PUBLIC_URL, "TUNNEL_PUBLIC_URL").hostname.toLowerCase()) return true;
  // Hosted installations use connect and retain the existing API aliases. Self-hosted routing
  // must not capture arbitrary customer api.* hosts as the CLI control plane.
  return env.OUTRAY_DEPLOYMENT_MODE === "self-hosted"
    ? host === `api.${base.toLowerCase()}`
    : host === "connect.outray.co" || host.startsWith("api.");
}

export function tunnelRootRedirect(host: string, base: string, path: string, env: PublicHostEnvironment = environment()): string | null {
  const normalizedBase = normalizePublicHostname(base);
  if (!normalizedBase || (host !== normalizedBase && host !== `www.${normalizedBase}`)) return null;
  const destination = env.CONSOLE_PUBLIC_URL || env.APP_URL || env.BETTER_AUTH_URL ||
    (env.OUTRAY_DEPLOYMENT_MODE !== "self-hosted" && normalizedBase === "outray.app" ? "https://outray.dev" : undefined);
  if (!destination) return null;
  const origin = publicOrigin(destination, "CONSOLE_PUBLIC_URL");
  // Concatenation keeps a request such as //evil.example a path, not an open redirect.
  return `${origin.origin}${path.startsWith("/") ? path : `/${path}`}`;
}

// Node workers also consume these helpers through CommonJS in development.
export default { canonicalStatusHostname, statusPublicOrigin, tunnelBaseDomain, infrastructureHostnames, tunnelRootRedirect, normalizePublicHostname, isTunnelControlHost, isReservedStatusCustomDomain, tunnelDnsHostname };
