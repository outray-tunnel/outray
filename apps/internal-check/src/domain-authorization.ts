import { isIP } from "node:net";
import publicHosts from "../../../shared/public-hosts";
import type { PublicHostEnvironment } from "../../../shared/public-hosts";
import instancePolicy from "../../../shared/instance-config";
import { isStatusNamespaceHost, statusPageSlugFromHost } from "./status-host";

export type CertificateLookup = (statement: string, parameters: string[]) => Promise<{ rowCount: number | null }>;

export function normalizeCertificateDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const domain = publicHosts.normalizePublicHostname(value);
  return domain && !isIP(domain) ? domain : null;
}

/** Caddy's on-demand TLS check. Never authorize a custom hostname merely
 * because it exists: its active binding must belong to the same tenant. */
export async function certificateDomainAllowed(
  domain: string,
  lookup: CertificateLookup,
  env: PublicHostEnvironment = process.env,
): Promise<boolean> {
  const instance = instancePolicy.instanceConfig(env);
  const uptimeEnabled = instance.products.includes("uptime") && (
    env.UPTIME_ENABLED === "true" || (instance.selfHosted && env.UPTIME_ENABLED !== "false")
  );
  const tunnelsEnabled = instance.products.includes("tunnels");
  if (isStatusNamespaceHost(domain, env)) {
    const canonical = publicHosts.canonicalStatusHostname(env);
    // Preserve the hosted infrastructure certificate; a disabled self-hosted
    // product never authorizes new tenant page certificates.
    if (domain === canonical) return !instance.selfHosted || uptimeEnabled;
    const slug = statusPageSlugFromHost(domain, env);
    if (!uptimeEnabled || !slug) return false;
    return (await lookup(
      "SELECT 1 FROM uptime_status_pages WHERE slug = $1 AND published = true LIMIT 1", [slug],
    )).rowCount === 1;
  }
  if (publicHosts.infrastructureHostnames(env).includes(domain)) return true;

  const base = publicHosts.tunnelBaseDomain(env);
  if (domain.endsWith(`.${base}`)) {
    if (!tunnelsEnabled) return false;
    return (await lookup("SELECT 1 FROM tunnels WHERE url = $1 LIMIT 1", [`https://${domain}`])).rowCount === 1;
  }

  return (await lookup(
    `SELECT 1 FROM domains d
     WHERE d.domain = $1 AND d.status = 'active'
       AND ((d.purpose = 'tunnel' AND $2 = 'true') OR
            (d.purpose = 'status' AND $3 = 'true' AND EXISTS (
              SELECT 1 FROM uptime_status_pages p
              WHERE p.domain_id = d.id AND p.organization_id = d.organization_id AND p.published = true
            )))
     LIMIT 1`,
    [domain, String(tunnelsEnabled), String(uptimeEnabled)],
  )).rowCount === 1;
}

/** A status-only gateway must never reuse the combined edge authorization
 * endpoint: that endpoint also approves tunnel and infrastructure hosts. */
export async function statusCertificateDomainAllowed(
  suppliedDomain: string,
  lookup: CertificateLookup,
  env: PublicHostEnvironment = process.env,
): Promise<boolean> {
  const domain = normalizeCertificateDomain(suppliedDomain);
  if (!domain) return false;
  const instance = instancePolicy.instanceConfig(env);
  const uptimeEnabled = instance.products.includes("uptime") && (
    env.UPTIME_ENABLED === "true" || (instance.selfHosted && env.UPTIME_ENABLED !== "false")
  );
  if (!uptimeEnabled) return false;
  if (isStatusNamespaceHost(domain, env)) {
    if (domain === publicHosts.canonicalStatusHostname(env)) return true;
    const slug = statusPageSlugFromHost(domain, env);
    if (!slug) return false;
    return (await lookup(
      "SELECT 1 FROM uptime_status_pages WHERE slug = $1 AND published = true LIMIT 1", [slug],
    )).rowCount === 1;
  }
  // Infrastructure names and the tunnel namespace cannot become status
  // routes, even if an invalid legacy/custom-domain row references them.
  if (publicHosts.isReservedStatusCustomDomain(domain, env)) return false;
  return (await lookup(
    `SELECT 1 FROM domains d
     WHERE d.domain = $1 AND d.purpose = 'status' AND d.status = 'active'
       AND EXISTS (
         SELECT 1 FROM uptime_status_pages p
         WHERE p.domain_id = d.id AND p.organization_id = d.organization_id AND p.published = true
       )
     LIMIT 1`,
    [domain],
  )).rowCount === 1;
}
