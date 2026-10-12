import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, Plus, Search, X } from "lucide-react";
import { Button } from "../arc/button/button";
import { OrganizationAvatar } from "../sidebar/organization-switcher-content";
import { filterSwitcherOrganizations, type SwitcherOrganization } from "../sidebar/organization-switcher-state";
import { WorkspaceInput } from "../ui/workspace-input";

export interface OrganizationAccessPageProps {
  organizations: SwitcherOrganization[];
  orgSlug: string;
  isSelectRoute?: boolean;
  remainingPath?: string;
}

function OrganizationAccessShell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-svh flex-col bg-[#080808] font-sans text-zinc-200 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-zinc-400">
    <header className="mx-auto flex min-h-[76px] w-full max-w-[1180px] items-center justify-between gap-6 px-8 py-5 max-[600px]:min-h-16 max-[600px]:px-5 max-[600px]:py-4">
      <Link to="/" search={{}} hash="" className="inline-flex items-center gap-2.5 rounded-md text-zinc-50 no-underline [&_img]:object-contain [&_span]:text-[17px] [&_span]:font-semibold [&_span]:tracking-[-.035em]" aria-label="OutRay home">
        <img src="/logo.png" width={28} height={28} alt="" />
        <span>OutRay</span>
      </Link>
      <Link to="/" search={{}} hash="" className="inline-flex min-h-8 items-center gap-[7px] rounded-[5px] text-xs text-zinc-400 no-underline transition-colors duration-140 hover:text-zinc-100 max-[600px]:min-h-11 motion-reduce:transition-none">
        <ArrowLeft size={14} aria-hidden="true" />Back to home
      </Link>
    </header>
    <main className="flex flex-1 items-center justify-center px-6 pt-14 pb-28 max-[600px]:px-5 max-[600px]:pt-10 max-[600px]:pb-[72px]">{children}</main>
  </div>;
}

export function OrganizationAccessPage({ organizations, orgSlug, isSelectRoute = false, remainingPath = "" }: OrganizationAccessPageProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const showSearch = organizations.length > 5;
  const effectiveQuery = showSearch ? query : "";
  const matches = filterSwitcherOrganizations(organizations, effectiveQuery);

  return <OrganizationAccessShell>
    <section className="w-full max-w-[440px] min-w-0" aria-labelledby="organization-access-title">
      <div className="mb-5 flex size-11 items-center justify-center rounded-xl border border-white/[.08] bg-[#121212] text-zinc-400" aria-hidden="true"><Building2 size={22} strokeWidth={1.5} /></div>
      <div className="mb-7 [&_h1]:m-0 [&_h1]:text-xl [&_h1]:leading-[1.4] [&_h1]:font-normal [&_h1]:tracking-[-.035em] [&_h1]:text-zinc-100 [&_p]:mt-2.25 [&_p]:mb-0 [&_p]:text-[13px] [&_p]:leading-[1.75] [&_p]:text-[#8b8b94] [&_p]:[overflow-wrap:anywhere]">
        <h1 id="organization-access-title">{isSelectRoute ? "Choose an organization" : "Organization not found"}</h1>
        <p>{isSelectRoute ? "Choose where you’d like to continue." : <>
          <span className="text-zinc-300">{orgSlug}</span> is unavailable or you don’t have access. Choose another organization, or ask its owner for an invitation.
        </>}</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[.08] bg-[#101010]">
        <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 [&_h2]:m-0 [&_h2]:text-xs [&_h2]:leading-5 [&_h2]:font-normal [&_h2]:text-zinc-400 [&>span]:text-[11px] [&>span]:text-zinc-500">
          <h2>Your organizations</h2>
          <span>{organizations.length} available</span>
        </div>
        {showSearch && <div className="relative mx-3 mt-0 mb-2.5 text-zinc-500 [--workspace-input-padding-left:34px] [--workspace-input-padding-right:40px]">
          <Search size={15} className="pointer-events-none absolute top-[11px] left-3" aria-hidden="true" />
          <WorkspaceInput ref={searchRef} type="search" size="compact" aria-label="Search organizations" placeholder="Find an organization…" value={query}
            onChange={(event) => setQuery(event.target.value)} maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          {query && <Button type="button" variant="ghost" size="sm" className="absolute top-0.5 right-[3px] h-8 w-[30px] p-0!" aria-label="Clear organization search" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={14} aria-hidden="true" /></Button>}
        </div>}
        {matches.length ? <nav className="max-h-[min(360px,45svh)] overflow-y-auto overscroll-contain px-1.5 pb-1.5 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]" aria-label="Organizations">
          <ul className="m-0 list-none p-0 [&>li+li]:border-t [&>li+li]:border-white/[.05]">
            {matches.map((organization) => {
              const base = `/${encodeURIComponent(organization.slug)}`;
              const destination = isSelectRoute && remainingPath ? `${base}/${remainingPath}` : `${base}/tunnel`;
              return <li key={organization.id}>
                <Link to={destination} search={{}} hash="" className="group flex min-h-[72px] min-w-0 items-center gap-3 rounded-[10px] px-2.5 py-3 no-underline transition-colors duration-140 hover:bg-white/[.04] focus-visible:bg-white/[.04] motion-reduce:transition-none" data-org-option="">
                  <OrganizationAvatar organization={organization} className="size-9! basis-9! rounded-[10px]! bg-[#1b1b1e]! text-xs!" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-[13px] leading-[19px] font-medium text-zinc-300" title={organization.name}>{organization.name}</span>
                    <span className="truncate text-xs leading-[17px] text-zinc-500" title={organization.slug}>{organization.slug}</span>
                  </span>
                  <ArrowRight size={16} className="mr-[3px] shrink-0 text-zinc-600 transition-[color,transform] duration-140 group-hover:translate-x-0.5 group-hover:text-zinc-300 group-focus-visible:translate-x-0.5 group-focus-visible:text-zinc-300 motion-reduce:transition-none" aria-hidden="true" />
                </Link>
              </li>;
            })}
          </ul>
        </nav> : <div className="px-5 pt-7 pb-8 text-center [&_p]:m-0 [&_p]:text-[13px] [&_p]:text-zinc-300 [&>span]:mt-[7px] [&>span]:block [&>span]:text-xs [&>span]:text-zinc-500">
          <p>{organizations.length ? "No organizations found" : "No organizations yet"}</p>
          <span>{organizations.length ? "Try another name or slug." : "Create an organization to get started."}</span>
        </div>}
        <div className="min-h-12 border-t border-white/[.07] p-1.5">
          <Link to="/onboarding" search={{}} hash="" className="flex min-h-9 items-center gap-2.25 rounded-[10px] px-2.5 py-2 text-xs text-zinc-400 no-underline transition-[color,background-color] duration-140 hover:bg-white/[.03] hover:text-zinc-100 max-[600px]:min-h-11 motion-reduce:transition-none"><Plus size={15} aria-hidden="true" />Create organization</Link>
        </div>
      </div>
      {showSearch && <p className="sr-only" role="status" aria-live="polite">{effectiveQuery.trim() ? `${matches.length} ${matches.length === 1 ? "organization" : "organizations"} found` : ""}</p>}
    </section>
  </OrganizationAccessShell>;
}

export function OrganizationAccessSkeleton() {
  return <OrganizationAccessShell>
    <div className="w-full max-w-[440px] min-w-0" role="status" aria-label="Loading organizations" aria-busy="true">
      <div aria-hidden="true">
        <div className="mb-5 size-11 animate-pulse rounded-xl bg-white/[.06] motion-reduce:animate-none" />
        <div className="mb-7">
          <div className="mb-3.5 h-6 w-[220px] max-w-3/4 animate-pulse rounded-[5px] bg-white/[.06] motion-reduce:animate-none" />
          <div className="mb-2.5 h-3 w-full animate-pulse rounded-[5px] bg-white/[.06] motion-reduce:animate-none" />
          <div className="h-3 w-3/4 animate-pulse rounded-[5px] bg-white/[.06] motion-reduce:animate-none" />
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/[.08] bg-[#101010]">
          <div className="flex min-h-12 items-center px-4 py-3"><div className="h-3 w-32 animate-pulse rounded-[5px] bg-white/[.06] motion-reduce:animate-none" /></div>
          {[0, 1].map((row) => <div key={row} className="flex min-h-[72px] items-center gap-3 border-t border-white/[.05] px-4 py-3">
            <div className="size-9 shrink-0 animate-pulse rounded-[10px] bg-white/[.06] motion-reduce:animate-none" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="h-3 w-32 animate-pulse rounded-[5px] bg-white/[.06] motion-reduce:animate-none" />
              <div className="mt-1 h-2.5 w-20 animate-pulse rounded-[5px] bg-white/[.06] motion-reduce:animate-none" />
            </div>
          </div>)}
          <div className="min-h-12 border-t border-white/[.07] p-1.5"><div className="mx-2.5 my-3 h-3 w-32 animate-pulse rounded-[5px] bg-white/[.06] motion-reduce:animate-none" /></div>
        </div>
      </div>
    </div>
  </OrganizationAccessShell>;
}
