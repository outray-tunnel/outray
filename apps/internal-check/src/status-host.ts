import publicHosts from "../../../shared/public-hosts";
import type { PublicHostEnvironment } from "../../../shared/public-hosts";
const PAGE_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isStatusNamespaceHost(host: string, env?: PublicHostEnvironment): boolean {
  const base = publicHosts.canonicalStatusHostname(env);
  return host === base || host.endsWith(`.${base}`);
}

/** Only published one-label page hosts may use on-demand certificate checks.
 * The normal wildcard certificate does not need this path. */
export function statusPageSlugFromHost(host: string, env?: PublicHostEnvironment): string | null {
  const base = publicHosts.canonicalStatusHostname(env);
  if (!host.endsWith(`.${base}`)) return null;
  const label = host.slice(0, -`.${base}`.length);
  return PAGE_SLUG.test(label) ? label : null;
}
