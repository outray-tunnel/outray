/** Local dashboard development must not silently open the hosted deployment. */
export function statusPageOrigin(configuredOrigin: string | undefined, development: boolean): string {
  return configuredOrigin?.trim() || (development ? "http://localhost:4323" : "https://status.outray.app");
}

/** Build the public URL for an OutRay-hosted status page. */
export function statusPageUrl(statusOrigin: string, slug: string): string {
  const url = new URL(statusOrigin);
  url.hostname = `${slug}.${url.hostname}`;
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.href;
}

/** Prefer the page's verified custom domain supplied by the API. */
export function preferredStatusPageUrl(
  statusOrigin: string,
  page: { slug: string; customDomain?: string | null },
): string {
  return page.customDomain
    ? `https://${page.customDomain}/`
    : statusPageUrl(statusOrigin, page.slug);
}

/** Open the local renderer without changing the page's canonical public address. */
export function statusPagePreviewUrl(statusOrigin: string, page: { slug: string; customDomain?: string | null }): string {
  const origin = new URL(statusOrigin);
  if (origin.hostname === "localhost" || origin.hostname === "127.0.0.1") {
    return new URL(`/${encodeURIComponent(page.slug)}/`, origin).href;
  }
  return preferredStatusPageUrl(statusOrigin, page);
}

/** The local renderer supports slug paths without DNS or public-host config. */
export function statusIncidentUrl(statusOrigin: string, slug: string, incidentId: string): string {
  return new URL(`incidents/${encodeURIComponent(incidentId)}`, statusPagePreviewUrl(statusOrigin, { slug })).href;
}
