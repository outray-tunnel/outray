const statusDomain = "status.outray.app";

/** The gateway and all of its subdomains are reserved for hosted Uptime pages. */
export function isReservedStatusDomain(domain: string): boolean {
  const hostname = domain.trim().toLowerCase().replace(/\.$/, "");
  return hostname === statusDomain || hostname.endsWith(`.${statusDomain}`);
}
