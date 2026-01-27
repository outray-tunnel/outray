import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { User, Building2 } from "lucide-react";

export const Route = createFileRoute("/$orgSlug/settings")({
  head: () => ({
    meta: [
      { title: "Settings - OutRay" },
    ],
  }),
  component: SettingsLayout,
});

function SettingsLayout() {
  const { orgSlug } = Route.useParams();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  if (!user) {
    return null;
  }

  const tabs = [
    {
      to: `/${orgSlug}/settings/profile`,
      label: "Profile",
      icon: User,
    },
    {
      to: `/${orgSlug}/settings/organization`,
      label: "Organization",
      icon: Building2,
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Settings
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Manage your account settings and preferences
          </p>
        </div>
      </div>

      <div className="border-b border-white/10 overflow-x-auto">
        <div className="flex items-center gap-4 sm:gap-6">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className="flex items-center gap-2 pb-3 text-sm font-medium transition-colors border-b-2 border-transparent hover:text-white text-gray-400"
              activeProps={{
                className: "!text-white !border-white",
              }}
            >
              <tab.icon size={16} />
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <Outlet />
    </div>
  );
}
