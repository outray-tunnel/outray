import { createFileRoute } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import Building06Icon from "@hugeicons-pro/core-stroke-rounded/Building06Icon";
import HashtagIcon from "@hugeicons-pro/core-stroke-rounded/HashtagIcon";
import TextIcon from "@hugeicons-pro/core-stroke-rounded/TextIcon";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/$orgSlug/settings/organization")({
  head: () => ({
    meta: [{ title: "Organization Settings - OutRay" }],
  }),
  component: OrganizationSettingsView,
});

function OrganizationSettingsView() {
  const { orgSlug } = Route.useParams();

  const { data: organizations } = authClient.useListOrganizations();

  const currentOrg = organizations?.find((org) => org.slug === orgSlug);

  if (!currentOrg) {
    return null;
  }

  return (
    <div className="space-y-7">
      <section className="rounded-xl border border-white/[0.07]">
        <div className="flex items-center gap-3 px-5 py-5 sm:px-6">
          <HugeiconsIcon
            icon={Building06Icon}
            size={17}
            strokeWidth={1.7}
            className="text-zinc-600"
          />
          <div>
            <h2 className="text-sm font-medium text-zinc-300">Organization</h2>
            <p className="mt-1 text-[11px] text-zinc-600">
              Identity used across this workspace.
            </p>
          </div>
        </div>

        <div className="grid border-t border-white/[0.07] md:grid-cols-2 md:divide-x md:divide-white/[0.07]">
          <OrganizationField
            label="Organization name"
            value={currentOrg.name}
            icon={TextIcon}
          />
          <OrganizationField
            label="Organization slug"
            value={currentOrg.slug}
            icon={HashtagIcon}
          />
        </div>
      </section>
    </div>
  );
}

function OrganizationField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: typeof TextIcon;
}) {
  return (
    <div className="px-5 py-5 sm:px-6">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </p>
      <div className="mt-3 flex items-center gap-2.5 text-xs text-zinc-400">
        <HugeiconsIcon icon={icon} size={14} strokeWidth={1.7} />
        <span className="truncate font-mono">{value}</span>
      </div>
    </div>
  );
}
