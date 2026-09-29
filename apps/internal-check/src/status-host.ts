const STATUS_BASE_HOST = "status.outray.app";
const PAGE_SLUG = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

export function isStatusNamespaceHost(host: string): boolean {
  return host === STATUS_BASE_HOST || host.endsWith(`.${STATUS_BASE_HOST}`);
}

/** Only published one-label page hosts may use on-demand certificate checks.
 * The normal wildcard certificate does not need this path. */
export function statusPageSlugFromHost(host: string): string | null {
  if (!host.endsWith(`.${STATUS_BASE_HOST}`)) return null;
  const label = host.slice(0, -`.${STATUS_BASE_HOST}`.length);
  return PAGE_SLUG.test(label) ? label : null;
}
