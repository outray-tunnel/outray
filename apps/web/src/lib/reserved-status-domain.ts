import publicHosts from "../../../../shared/public-hosts";
import type { PublicHostEnvironment } from "../../../../shared/public-hosts";

/** The gateway and all of its subdomains are reserved for hosted Uptime pages. */
export function isReservedStatusDomain(domain: string, env?: PublicHostEnvironment): boolean {
  const statusDomain = publicHosts.canonicalStatusHostname(env || {
    OUTRAY_STATUS_URL: typeof process !== "undefined" ? process.env.OUTRAY_STATUS_URL : undefined,
    STATUS_PUBLIC_URL: (typeof process !== "undefined" ? process.env.STATUS_PUBLIC_URL : undefined) || import.meta.env?.VITE_OUTRAY_STATUS_URL,
  });
  const hostname = domain.trim().toLowerCase().replace(/\.$/, "");
  return hostname === statusDomain || hostname.endsWith(`.${statusDomain}`);
}
