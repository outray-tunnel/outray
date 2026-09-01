import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { HugeiconsIcon } from "@hugeicons/react";
import Building06Icon from "@hugeicons-pro/core-stroke-rounded/Building06Icon";
import UserIcon from "@hugeicons-pro/core-stroke-rounded/UserIcon";
import { WorkspacePageHeader } from "@/components/workspace-page-header";

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
      icon: UserIcon,
    },
    {
      to: `/${orgSlug}/settings/organization`,
      label: "Organization",
      icon: Building06Icon,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <WorkspacePageHeader
        title="Settings"
        description="Manage your identity and organization preferences."
      />

      <div className="overflow-x-auto border-b border-white/[0.07]">
        <div className="flex items-center gap-6">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className="flex items-center gap-2 border-b pb-3 text-[11px] font-medium text-zinc-700 transition-colors hover:text-zinc-300 border-transparent"
              activeProps={{
                className: "!border-white !text-zinc-200",
              }}
            >
              <HugeiconsIcon icon={tab.icon} size={14} strokeWidth={1.7} />
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <Outlet />
    </div>
  );
}
