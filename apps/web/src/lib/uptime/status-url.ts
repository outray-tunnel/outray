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
