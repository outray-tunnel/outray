import { isReservedSlug } from "./reserved-slugs";

/** Actual root routes and static directories cannot be workspace URLs, even
 * on an independently hosted instance. Keep this list in sync with web routes. */
export const WORKSPACE_ROUTE_SLUGS = [
  "admin", "api", "changelog", "cli", "contact", "docs", "email-templates",
  "express", "internal", "invitations", "login", "nestjs", "nextjs",
  "onboarding", "plugins", "pricing", "privacy", "products", "report-bug",
  "select", "signup", "terms", "vite",
  "assets", "brand", "fonts", "frameworks", "logos",
] as const;

const routeSlugs: ReadonlySet<string> = new Set(WORKSPACE_ROUTE_SLUGS);
export type WorkspaceSlugRejection = "invalid" | "route" | "reserved";

export function workspaceSlugRejection(
  slug: unknown,
  { selfHosted }: { selfHosted: boolean },
): WorkspaceSlugRejection | null {
  if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "invalid";
  }
  // Hosted branding/future-name reservations do not apply to instance owners.
  if (selfHosted) return routeSlugs.has(slug) ? "route" : null;
  return isReservedSlug(slug) ? "reserved" : null;
}

export function workspaceSlugErrorMessage(reason: WorkspaceSlugRejection): string {
  if (reason === "route") return "This workspace URL is used by the application. Choose another URL.";
  if (reason === "reserved") return "This workspace URL is reserved.";
  return "Use lowercase letters, numbers, and single hyphens between words.";
}

// Shared files are consumed by both ESM bundles and tsx's CommonJS loader.
export default { WORKSPACE_ROUTE_SLUGS, workspaceSlugRejection, workspaceSlugErrorMessage };
