import {
  createFileRoute,
  Outlet,
  Navigate,
  notFound,
  useLocation,
} from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { Sidebar } from "@/components/app-sidebar";
import { ProductSubSidebar } from "@/components/product-sub-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { MobileNavSheet } from "@/components/mobile-nav-sheet";
import { useAppStore } from "@/lib/store";
import { useFeatureFlag } from "@/lib/feature-flags";
import { OrganizationAccessPage, OrganizationAccessSkeleton } from "@/components/organization/organization-access-page";
import { AgentChatProvider } from "@/components/agent/agent-chat-provider";
import { AgentChatHost } from "@/components/agent/agent-chat-host";
import { instanceProductForPath } from "../../../../shared/instance-config";

export const Route = createFileRoute("/$orgSlug")({
  beforeLoad: ({ context, location }) => {
    const product = instanceProductForPath(location.pathname);
    if ((product && !context.instance.products.includes(product)) ||
        (!context.instance.billingEnabled && /\/billing(?:\/|$)/.test(location.pathname))) {
      throw notFound();
    }
  },
  head: () => ({
    meta: [{ title: "Dashboard - OutRay" }],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const { orgSlug } = Route.useParams();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const unifiedSidebar = useFeatureFlag("unified_sidebar");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { data: organizations, isPending } = authClient.useListOrganizations();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: session } = authClient.useSession();
  const setSelectedOrganization = useAppStore(
    (state) => state.setSelectedOrganization,
  );

  const matchedOrg = organizations?.find((org) => org.slug === orgSlug);
  const matchedOrgId = matchedOrg?.id;
  const matchedOrgName = matchedOrg?.name;
  const matchedOrgSlug = matchedOrg?.slug;
  const activeOrgId = activeOrg?.id;

  // Set the active organization when the orgSlug changes
  useEffect(() => {
    if (matchedOrgId && activeOrgId !== matchedOrgId) {
      void authClient.organization.setActive({
        organizationId: matchedOrgId,
      });
    }
  }, [matchedOrgId, activeOrgId]);

  useEffect(() => {
    if (!matchedOrgId || !matchedOrgName || !matchedOrgSlug) return;

    setSelectedOrganization({
      id: matchedOrgId,
      name: matchedOrgName,
      slug: matchedOrgSlug,
    });
  }, [matchedOrgId, matchedOrgName, matchedOrgSlug, setSelectedOrganization]);

  if (isPending) {
    return <OrganizationAccessSkeleton />;
  }

  if (!organizations?.length) {
    return <Navigate to="/onboarding" />;
  }

  // /select/** is an organization picker, not an unavailable organization.
  const isSelectRoute = orgSlug === "select";
  // Get the remaining path after /select/ (e.g., /select/billing -> billing)
  const remainingPath = isSelectRoute
    ? location.pathname.replace(/^\/select\/?/, "")
    : "";

  if (!matchedOrg) {
    return <OrganizationAccessPage organizations={organizations} orgSlug={orgSlug} isSelectRoute={isSelectRoute} remainingPath={remainingPath} />;
  }

  const onboardingPath = location.pathname.replace(/\/+$/, "");
  if (
    onboardingPath === `/${orgSlug}/get-started` ||
    onboardingPath === `/${orgSlug}/setup`
  ) {
    return <Outlet />;
  }

  return (
    <AgentChatProvider key={`${session?.user.id ?? "pending"}:${matchedOrgId}`} orgSlug={orgSlug}>
    <div className="workspace-ui fixed inset-0 flex overflow-hidden bg-[#070707] text-gray-300 font-sans selection:bg-accent/30">
      {/* Keep the workspace in the viewport; long pages scroll inside main. */}
      <div className="flex h-full min-h-0 w-full overflow-hidden">
        {/* Desktop sidebar - hidden on mobile */}
        <div className="hidden md:flex h-full">
          <Sidebar
            isCollapsed={isCollapsed}
            setIsCollapsed={setIsCollapsed}
            unified={unifiedSidebar}
          />
          {!unifiedSidebar && <ProductSubSidebar />}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#090909]">
          <WorkspaceTopbar
            onOpenNavigation={() => setMobileNavOpen(true)}
            isNavigationOpen={mobileNavOpen}
          />
          <main className="flex min-h-0 flex-1 flex-col">
            <div
              data-scroll-restoration-id={`workspace-content-${orgSlug}`}
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-5 pb-[calc(80px+env(safe-area-inset-bottom))] md:px-12 md:py-8 md:pb-8"
            >
              <Outlet />
            </div>
          </main>
        </div>
        <AgentChatHost />
      </div>

      {/* Mobile bottom navigation */}
      <MobileBottomNav
        onOpenNavigation={() => setMobileNavOpen(true)}
        isNavigationOpen={mobileNavOpen}
      />
      <MobileNavSheet
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        orgSlug={orgSlug}
      />
    </div>
    </AgentChatProvider>
  );
}
