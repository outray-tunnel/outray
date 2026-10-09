import { HugeiconsIcon } from "@hugeicons/react";
import Add01Icon from "@hugeicons-pro/core-stroke-rounded/Add01Icon";
import ArrowRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowRight01Icon";
import Building06Icon from "@hugeicons-pro/core-stroke-rounded/Building06Icon";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/select")({
  head: () => ({
    meta: [
      { title: "Choose a workspace - OutRay" },
    ],
  }),
  component: SelectOrganization,
});

function SelectOrganization() {
  const { data: organizations, isPending } = authClient.useListOrganizations();
  const { data: session } = authClient.useSession();

  if (!isPending && !organizations?.length) {
    return <Navigate to="/onboarding" />;
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white selection:bg-white/15">
      <header className="border-b border-white/[0.08]">
        <div className="mx-auto flex h-[76px] w-full max-w-[1180px] items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="OutRay home">
            <img src="/logo.png" alt="" className="size-9 object-contain" />
            <span className="text-[18px] font-semibold tracking-[-0.025em]">OutRay</span>
          </Link>

          {session?.user && (
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden min-w-0 text-right sm:block">
                <p className="truncate text-[13px] font-medium text-zinc-200">
                  {session.user.name || "Your account"}
                </p>
                <p className="max-w-60 truncate text-[12px] text-zinc-600">
                  {session.user.email}
                </p>
              </div>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[12px] font-semibold text-zinc-200">
                {getInitials(session.user.name || session.user.email)}
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(250px,0.7fr)_minmax(0,1.3fr)] lg:gap-20 lg:py-24">
        <section className="lg:sticky lg:top-16 lg:self-start">
          <div className="mb-7 flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045]">
            <HugeiconsIcon icon={Building06Icon} size={23} strokeWidth={1.7} className="text-zinc-300" />
          </div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            Your workspaces
          </p>
          <h1 className="max-w-md text-[38px] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[44px]">
            Where are you working today?
          </h1>
          <p className="mt-5 max-w-sm text-[15px] leading-7 text-zinc-500">
            Choose a workspace to open its tunnels, observability data, and secrets.
          </p>

          <Link
            to="/onboarding"
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-4 text-[13px] font-medium text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.09] hover:text-white"
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.9} />
            Create workspace
          </Link>
        </section>

        <section aria-labelledby="workspace-list-title" className="min-w-0">
          <div className="mb-4 flex items-end justify-between px-1">
            <div>
              <h2 id="workspace-list-title" className="text-[16px] font-semibold tracking-[-0.015em]">
                Select a workspace
              </h2>
              <p className="mt-1 text-[13px] text-zinc-600">
                {isPending
                  ? "Loading your workspaces"
                  : `${organizations?.length || 0} ${organizations?.length === 1 ? "workspace" : "workspaces"}`}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#0b0b0b]">
            {isPending ? (
              <WorkspaceListSkeleton />
            ) : (
              organizations?.map((organization, index) => (
                <Link
                  key={organization.id}
                  to="/$orgSlug/tunnel"
                  params={{ orgSlug: organization.slug }}
                  className={`group flex min-h-[104px] items-center gap-4 px-5 py-5 transition-colors hover:bg-white/[0.045] sm:gap-5 sm:px-6 ${
                    index ? "border-t border-white/[0.075]" : ""
                  }`}
                >
                  <OrganizationAvatar
                    name={organization.name}
                    logo={organization.logo}
                  />

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[16px] font-semibold tracking-[-0.015em] text-zinc-100 sm:text-[17px]">
                      {organization.name}
                    </h3>
                    <p className="mt-1 truncate font-mono text-[12px] text-zinc-600">
                      /{organization.slug}
                    </p>
                  </div>

                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.025] text-zinc-600 transition-all duration-200 group-hover:border-white/15 group-hover:bg-white/[0.07] group-hover:text-white">
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={17}
                      strokeWidth={1.8}
                      className="transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </div>
                </Link>
              ))
            )}
          </div>

          <p className="mt-5 px-1 text-[12px] leading-5 text-zinc-700">
            You only see workspaces where you are an active member.
          </p>
        </section>
      </div>
    </main>
  );
}

function OrganizationAvatar({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <div className="relative flex size-13 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.055] sm:size-14">
      {logo ? (
        <img src={logo} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-zinc-300">
          {getInitials(name)}
        </span>
      )}
    </div>
  );
}

function WorkspaceListSkeleton() {
  return (
    <div aria-label="Loading workspaces" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className={`flex min-h-[104px] items-center gap-5 px-5 py-5 sm:px-6 ${
            item ? "border-t border-white/[0.075]" : ""
          }`}
        >
          <div className="size-13 shrink-0 animate-pulse rounded-2xl bg-white/[0.055] sm:size-14" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="h-4 w-40 animate-pulse rounded-full bg-white/[0.055]" />
            <div className="h-3 w-24 animate-pulse rounded-full bg-white/[0.035]" />
          </div>
          <div className="size-10 animate-pulse rounded-full bg-white/[0.035]" />
        </div>
      ))}
    </div>
  );
}

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "OR";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}
