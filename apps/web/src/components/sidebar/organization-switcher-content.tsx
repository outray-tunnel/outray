import { useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Plus, Search } from "lucide-react";
import { filterSwitcherOrganizations, organizationInitials, organizationLogo, organizationSwitchDestination, type SwitcherOrganization } from "./organization-switcher-state";

const organizationAvatarClassName = "inline-flex size-5 basis-5 items-center justify-center overflow-hidden rounded-[5px] border border-white/10 bg-[#202023] text-[9px] leading-none font-medium text-zinc-300 [&>img]:size-full [&>img]:object-cover";

export interface OrganizationSwitcherContentProps {
  organizations: SwitcherOrganization[];
  orgSlug: string;
  pathname: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (organization: SwitcherOrganization, event: MouseEvent<HTMLAnchorElement>) => void;
  onCreate: (event: MouseEvent<HTMLAnchorElement>) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onListKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  listRef: RefObject<HTMLDivElement | null>;
}

export function OrganizationAvatar({ organization, className = "" }: { organization?: SwitcherOrganization; className?: string }) {
  const logo = organizationLogo(organization?.logo);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  return <span className={`${organizationAvatarClassName} ${className}`} aria-hidden="true">
    {logo && logo !== failedLogo ? <img src={logo} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setFailedLogo(logo)} /> : organizationInitials(organization?.name ?? "")}
  </span>;
}

export function OrganizationSwitcherContent({ organizations, orgSlug, pathname, query, onQueryChange, onSelect, onCreate, onSearchKeyDown, onListKeyDown, searchRef, listRef }: OrganizationSwitcherContentProps) {
  const showSearch = organizations.length > 5;
  const effectiveQuery = showSearch ? query : "";
  const matches = filterSwitcherOrganizations(organizations, effectiveQuery);
  return <>
    <header className="flex shrink-0 items-center px-2.5 pt-2.25 pb-1.5 text-[11px] leading-4 font-normal text-zinc-500">
      <span>Organizations</span>
    </header>
    {showSearch && <div className="mx-2 mt-0 mb-1.5 flex shrink-0 items-center gap-1.5 rounded-md border border-white/[.08] bg-[#0f0f10] px-2 text-zinc-500 transition-colors duration-120 focus-within:border-white/25 motion-reduce:transition-none [&>svg]:shrink-0">
      <Search size={14} aria-hidden="true" />
      <input ref={searchRef} className="h-[30px] w-full min-w-0 border-0 bg-transparent font-[inherit] text-xs leading-[18px] text-zinc-200 outline-none placeholder:text-zinc-500 focus-visible:outline-none" type="search" aria-label="Search organizations" placeholder="Find an organization…" value={query} onChange={(event) => onQueryChange(event.target.value)} onKeyDown={onSearchKeyDown} maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} />
    </div>}
    <div ref={listRef} className="min-h-0 overflow-y-auto overscroll-contain px-1 pb-1 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]" onKeyDown={onListKeyDown}>
      {matches.length ? <nav aria-label="Organizations"><ul className="m-0 list-none p-0 [&>li+li]:mt-0.5">
        {matches.map((organization) => {
          const current = organization.slug === orgSlug;
          return <li key={organization.id}>
            <Link to={current ? pathname : organizationSwitchDestination(pathname, orgSlug, organization.slug)} search={current ? (previous) => previous : {}} hash={current ? true : ""} data-org-option="" aria-current={current ? "true" : undefined} onClick={(event) => onSelect(organization, event)} className="group flex min-h-8 min-w-0 items-center gap-2 rounded-xl px-1.5 py-1 no-underline outline-none transition-colors duration-120 hover:bg-white/[.065] focus-visible:bg-white/[.065] focus-visible:shadow-[inset_0_0_0_1px_rgb(255_255_255/.2)] aria-current:bg-white/[.055] [@media(pointer:coarse)]:min-h-11 motion-reduce:transition-none">
              <OrganizationAvatar organization={organization} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="block truncate text-[13px] leading-[18px] font-normal text-zinc-400 group-hover:text-zinc-100 group-focus-visible:text-zinc-100 group-aria-current:text-zinc-100" title={organization.name}>{organization.name}</span></span>
              {current && <Check size={15} className="ml-1 shrink-0 text-zinc-300" aria-label="Current organization" />}
            </Link>
          </li>;
        })}
      </ul></nav> : <div className="flex flex-col items-center gap-1.5 px-3.5 py-6 text-center text-zinc-600 [&>p]:mt-1 [&>p]:mb-0 [&>p]:text-xs [&>p]:leading-[18px] [&>p]:text-zinc-400 [&>span]:text-[11px] [&>span]:leading-[18px] [&>span]:text-zinc-500">
        <Search size={18} aria-hidden="true" /><p>{organizations.length ? "No organizations found" : "No organizations yet"}</p><span>{organizations.length ? "Try another name or slug." : "Create an organization to get started."}</span>
      </div>}
    </div>
    {showSearch && <p className="sr-only" role="status" aria-live="polite">{effectiveQuery.trim() ? `${matches.length} ${matches.length === 1 ? "organization" : "organizations"} found` : ""}</p>}
    <footer className="shrink-0 border-t border-white/[.07] p-1">
      <Link to="/onboarding" search={{}} hash="" onClick={onCreate} className="flex min-h-8 items-center gap-2 rounded-xl px-1.5 text-xs font-normal text-zinc-400 no-underline outline-none transition-[background-color,color] duration-120 hover:bg-white/[.045] hover:text-zinc-200 focus-visible:bg-white/[.045] focus-visible:text-zinc-200 focus-visible:shadow-[inset_0_0_0_1px_rgb(255_255_255/.2)] [@media(pointer:coarse)]:min-h-11 motion-reduce:transition-none"><Plus size={15} aria-hidden="true" />Create organization</Link>
    </footer>
  </>;
}
