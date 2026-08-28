import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mail01Icon, UserIcon } from "@hugeicons-pro/core-stroke-rounded";

export const Route = createFileRoute("/$orgSlug/settings/profile")({
  head: () => ({
    meta: [
      { title: "Profile Settings - OutRay" },
    ],
  }),
  component: ProfileSettingsView,
});

function ProfileSettingsView() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  if (!user) {
    return null;
  }

  return (
    <section className="border-y border-white/[0.07]">
      <div className="flex items-center gap-4 py-5">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sm font-medium text-zinc-300">
          {user.name?.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-zinc-200">
            {user.name}
          </h2>
          <p className="mt-1 truncate text-[11px] text-zinc-600">
            Personal account
          </p>
        </div>
      </div>

      <div className="grid border-t border-white/[0.07] md:grid-cols-2 md:divide-x md:divide-white/[0.07]">
        <ReadOnlyField
          label="Full name"
          value={user.name || ""}
          icon={UserIcon}
        />
        <ReadOnlyField
          label="Email address"
          value={user.email || ""}
          icon={Mail01Icon}
        />
      </div>
    </section>
  );
}

function ReadOnlyField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: typeof UserIcon;
}) {
  return (
    <div className="py-5 md:px-6 first:pl-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </p>
      <div className="mt-3 flex items-center gap-2.5 text-xs text-zinc-400">
        <HugeiconsIcon icon={icon} size={14} strokeWidth={1.7} />
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}
