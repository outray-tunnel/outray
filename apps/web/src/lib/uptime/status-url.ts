/** Build the public URL for an OutRay-hosted status page. */
export function statusPageUrl(statusOrigin: string, slug: string): string {
  const url = new URL(statusOrigin);
  url.hostname = `${slug}.${url.hostname}`;
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.href;
}
