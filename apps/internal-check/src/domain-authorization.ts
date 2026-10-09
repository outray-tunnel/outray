import { isIP } from "node:net";
import publicHosts from "../../../shared/public-hosts";
import type { PublicHostEnvironment } from "../../../shared/public-hosts";
import instancePolicy from "../../../shared/instance-config";
import { isStatusNamespaceHost, statusPageSlugFromHost } from "./status-host";

type Lookup = (statement: string, parameters: string[]) => Promise<{ rowCount: number | null }>;

export function normalizeCertificateDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const domain = publicHosts.normalizePublicHostname(value);
  return domain && !isIP(domain) ? domain : null;
}

/** Caddy's on-demand TLS check. Never authorize a custom hostname merely
 * because it exists: its active binding must belong to the same tenant. */
export async function certificateDomainAllowed(
  domain: string,
  lookup: Lookup,
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
