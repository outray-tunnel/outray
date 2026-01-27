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
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { MobileHeader } from "@/components/mobile-header";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/$orgSlug")({
  head: () => ({
    meta: [
      { title: "Dashboard - OutRay" },
    ],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const { orgSlug } = Route.useParams();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { data: organizations, isPending } = authClient.useListOrganizations();
  const { data: activeOrg } = authClient.useActiveOrganization();

  const matchedOrg = organizations?.find((org) => org.slug === orgSlug);

  // Set the active organization when the orgSlug changes
  useEffect(() => {
    if (matchedOrg && activeOrg?.id !== matchedOrg.id) {
      authClient.organization.setActive({
        organizationId: matchedOrg.id,
      });
    }
  }, [matchedOrg, activeOrg?.id]);

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

  return (
    <div className="min-h-screen bg-[#070707] text-gray-300 font-sans selection:bg-accent/30">
      {/* Mobile header */}
      <MobileHeader />

      <div className="flex h-[calc(100vh-52px)] md:h-screen overflow-hidden">
        {/* Desktop sidebar - hidden on mobile */}
        <div className="hidden md:flex h-full">
          <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#101010] md:border md:border-white/5 md:m-2 md:rounded-2xl">
          {/* <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-black">
           
          </header> */}

          <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
            <Outlet />
          </div>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <MobileBottomNav />
    </div>
  );
}
