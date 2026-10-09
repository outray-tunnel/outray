export interface SwitcherOrganization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
}

const staticSections = new Set([
  "/tunnel", "/tunnel/tunnels", "/tunnel/requests", "/tunnel/subdomains", "/tunnel/domains", "/members", "/tokens", "/billing",
  "/settings", "/settings/profile", "/settings/organization", "/get-started", "/setup",
  "/observability", "/observability/alerts", "/observability/services", "/observability/requests",
  "/observability/logs", "/observability/metrics", "/observability/traces",
  "/secrets", "/secrets/vaults", "/secrets/shares", "/secrets/trash", "/secrets/audit",
  "/uptime", "/uptime/monitors", "/uptime/incidents", "/uptime/notifications", "/uptime/status-page",
  "/uptime/status-page/appearance", "/uptime/status-page/components", "/uptime/status-page/domains", "/uptime/status-page/publishing",
]);

/** Preserve only known section paths, never an organization-scoped resource ID. */
export function organizationSwitchDestination(pathname: string, currentSlug: string, nextSlug: string): string {
  const base = `/${encodeURIComponent(nextSlug)}`;
  const overview = `${base}/tunnel`;
  if (!pathname.startsWith("/")) return overview;
  const [, encodedCurrent, ...segments] = pathname.replace(/\/+$/, "").split("/");
  try {
    if (decodeURIComponent(encodedCurrent) !== currentSlug) return overview;
  } catch {
    return overview;
  }
  const section = segments.length ? `/${segments.join("/")}` : "";
  if (["/tunnels", "/requests", "/subdomains", "/domains"].includes(section)) return `${overview}${section}`;
  if (section === "/secrets/projects") return `${base}/secrets/vaults`;
  if (section === "/observability/monitors") return `${base}/observability/alerts`;
  if (staticSections.has(section)) return `${base}${section}`;
  if (/^\/secrets\/(?:vaults|projects)\/[^/]+(?:\/.*)?$/.test(section)) return `${base}/secrets/vaults`;
  if (/^\/(?:tunnel\/)?tunnels\/[^/]+(?:\/.*)?$/.test(section)) return `${overview}/tunnels`;
  const resourceList = /^\/(uptime\/(?:monitors|incidents)|observability\/(?:alerts|services))\/[^/]+(?:\/.*)?$/.exec(section);
  return resourceList ? `${base}/${resourceList[1]}` : overview;
}

export function filterSwitcherOrganizations<T extends SwitcherOrganization>(organizations: readonly T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  return organizations.filter((organization) => !normalized || organization.name.toLowerCase().includes(normalized) || organization.slug.toLowerCase().includes(normalized));
}

export function organizationInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "O";
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return `${first}${last}`.toUpperCase();
}

/** Image sources cannot be executable schemes or protocol-relative external URLs. */
export function organizationLogo(logo: string | null | undefined): string | null {
  const source = logo?.trim();
  if (!source || source.includes("\\") || Array.from(source).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
  if (source.startsWith("/") && !source.startsWith("//")) return source;
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(source)) return source;
  if (!/^https:\/\//i.test(source)) return null;
  try {
    return new URL(source).protocol === "https:" ? source : null;
  } catch {
    return null;
  }
}
