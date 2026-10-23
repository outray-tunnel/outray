import { useMatches, useLocation } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/app-sidebar";
import { ProductSubSidebar } from "@/components/product-sub-sidebar";
import { authClient } from "@/lib/auth-client";
import { useFeatureFlag } from "@/lib/feature-flags";
import { useInstance } from "@/lib/instance-context";
import { workspaceScopeClassName } from "@/components/ui/workspace-scope";
import { isOrganizationSettingsPath } from "./settings-navigation-state";

/** The route outlet changes; the sidebar and its state stay mounted above it. */
export function WorkspaceFrame({ children }: { children: ReactNode }) {
  const workspace = useMatches({ select: (matches) => matches.some((match) => match.routeId === "/$orgSlug" || match.routeId === "/account") });
  return workspace ? <WorkspaceShell>{children}</WorkspaceShell> : children;
}

function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { data: session } = authClient.useSession();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const unifiedSidebar = useFeatureFlag("unified_sidebar");
  const instance = useInstance();
  const personal = pathname === "/account" || pathname.startsWith("/account/");
  // Params can still belong to the outgoing account route while location has
  // already changed. Resolve the scope from the same pathname as the menu.
  let routeOrgSlug = "";
  try { routeOrgSlug = decodeURIComponent(pathname.split("/")[1] ?? ""); } catch { /* Invalid paths cannot match a membership. */ }
  const organization = personal
    ? organizations?.find((org) => org.id === activeOrganization?.id) ?? organizations?.[0]
    : organizations?.find((org) => org.slug === routeOrgSlug);
  const orgSlug = organization?.slug ?? "";
  const organizationSettings = !personal && isOrganizationSettingsPath(pathname, orgSlug);
  const mode = personal ? "personal" : organizationSettings ? "organization" : "dashboard";
  const setup = pathname === `/${orgSlug}/get-started` || pathname === `/${orgSlug}/setup`;
  const showSidebar = Boolean(session?.user && (personal || organization) && !setup);
  const firstProduct = instance.products[0];
  const dashboardPath = firstProduct === "tunnels" ? "tunnel" : firstProduct === "observability" ? "observability" : firstProduct === "secrets" ? "secrets/vaults" : firstProduct === "uptime" ? "uptime" : "settings/organization";
  const backHref = orgSlug ? `/${encodeURIComponent(orgSlug)}/${dashboardPath}` : "/select";

  return <div className={`${workspaceScopeClassName} fixed inset-0 flex overflow-hidden bg-[#090909] font-sans text-zinc-300 selection:bg-accent/30`}>
    {showSidebar && <div className="hidden h-full shrink-0 md:flex">
      <Sidebar orgSlug={orgSlug} mode={mode} backHref={backHref} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} unified={unifiedSidebar} />
      {!organizationSettings && !personal && !unifiedSidebar && <ProductSubSidebar />}
    </div>}
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">{children}</div>
  </div>;
}
