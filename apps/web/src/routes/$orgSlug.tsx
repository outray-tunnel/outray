import {
  createFileRoute,
  Outlet,
  Navigate,
  Link,
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
import { ArrowRight } from "lucide-react";
import { AgentChatProvider } from "@/components/agent/agent-chat-provider";
import { AgentChatHost } from "@/components/agent/agent-chat-host";

export const Route = createFileRoute("/$orgSlug")({
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
    return null;
  }

  if (!organizations?.length) {
    return <Navigate to="/onboarding" />;
  }

  // Check if this is a /select/** route - show "Select Organization" instead of "Not Found"
  const isSelectRoute = orgSlug === "select";
  // Get the remaining path after /select/ (e.g., /select/billing -> billing)
  const remainingPath = isSelectRoute
    ? location.pathname.replace(/^\/select\/?/, "")
    : "";

  if (!isPending && !matchedOrg) {
    return (
      <div className="min-h-screen bg-[#070707] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <img src="/logo.png" alt="OutRay Logo" className="w-10" />
              <span className="font-bold text-white text-xl tracking-tight">
                OutRay
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {isSelectRoute ? "Select Organization" : "Organization Not Found"}
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              {isSelectRoute ? (
                "Choose an organization to continue to your dashboard."
              ) : (
                <>
                  You don't have access to{" "}
                  <span className="text-white font-medium">{orgSlug}</span>.
                  Please select one of your organizations to continue.
                </>
              )}
            </p>
          </div>

          <div className="space-y-3">
            {organizations.map((org) => {
              // For /select routes, preserve the remaining path
              const targetUrl =
                isSelectRoute && remainingPath
                  ? `/${org.slug}/${remainingPath}`
                  : `/${org.slug}`;

              return (
                <Link
                  key={org.id}
                  to={targetUrl}
                  className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-linear-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center group-hover:border-white/20 transition-colors">
                      <span className="text-sm font-bold text-white">
                        {org.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium text-white group-hover:text-white transition-colors">
                        {org.name}
                      </h3>
                      <p className="text-xs text-gray-500 font-mono">
                        {org.slug}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <Link
              to="/onboarding"
              className="text-sm text-gray-500 hover:text-white transition-colors"
            >
              Create a new organization
            </Link>
          </div>
        </div>
      </div>
    );
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
