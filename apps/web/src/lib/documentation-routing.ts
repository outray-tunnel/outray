/** Public documentation must never be interpreted as an organization slug. */
export function parseOrganizationRouteParams<T extends { orgSlug: string }>(params: T): T | false {
  if (params.orgSlug.toLowerCase() === "docs") {
    return false;
  }
  return params;
}

/** Keep an old Tunnel documentation link usable without redirecting unknown docs. */
export function getDocumentationAlias(publicHref: string): string | null {
  const suffixStart = publicHref.search(/[?#]/);
  const pathname = suffixStart === -1 ? publicHref : publicHref.slice(0, suffixStart);
  if (pathname.replace(/\/+$/, "") !== "/docs/tunnel/tunnels") return null;
  return `/docs/tunnels${suffixStart === -1 ? "" : publicHref.slice(suffixStart)}`;
}
