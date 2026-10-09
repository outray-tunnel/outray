/** Resolve only the retired Tunnel product URLs, not another product's routes. */
export function getLegacyTunnelPathname(pathname: string): string | null {
  if (pathname.includes("\\")) return null;
  const match = /^\/([^/]+)(?:\/(tunnels|requests|subdomains|domains)(?:\/([^/]+))?)?\/?$/.exec(pathname);
  if (!match) return null;

  const [, orgSlug, page, tunnelId] = match;
  if (orgSlug === "." || orgSlug === ".." || tunnelId === "." || tunnelId === "..") return null;
  if (tunnelId && page !== "tunnels") return null;

  const tunnelRoot = `/${orgSlug}/tunnel`;
  if (!page) return tunnelRoot;
  return `${tunnelRoot}/${page}${tunnelId ? `/${tunnelId}` : ""}`;
}

/**
 * publicHref is the original local history URL; searchStr and href have already
 * passed through TanStack's search parser and can lose duplicate/raw values.
 * Keep its suffix byte-for-byte and its already-encoded path segments intact.
 */
export function getLegacyTunnelRedirect(publicHref: string) {
  const suffixStart = publicHref.search(/[?#]/);
  const pathname = suffixStart === -1 ? publicHref : publicHref.slice(0, suffixStart);
  const destination = getLegacyTunnelPathname(pathname);
  if (!destination) return null;

  const suffix = suffixStart === -1 ? "" : publicHref.slice(suffixStart);
  const href = `${destination}${suffix}`;
  return {
    href,
    publicHref: href,
    replace: true as const,
    // Client-side href navigation reparses query parameters. Only retired URLs
    // require this document redirect, which preserves the raw query and hash.
    reloadDocument: true as const,
  };
}

export function legacyTunnelRedirectLocation(location: { publicHref: string }) {
  const destination = getLegacyTunnelRedirect(location.publicHref);
  if (!destination) throw new Error("Not a legacy Tunnel product URL");
  return destination;
}
