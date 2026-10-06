import { useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Plus, Search } from "lucide-react";
import { filterSwitcherOrganizations, organizationInitials, organizationLogo, organizationSwitchDestination, type SwitcherOrganization } from "./organization-switcher-state";
import styles from "./organization-switcher.module.css";

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
  return <span className={`${styles.avatar} ${className}`} aria-hidden="true">
    {logo && logo !== failedLogo ? <img src={logo} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setFailedLogo(logo)} /> : organizationInitials(organization?.name ?? "")}
  </span>;
}

export function OrganizationSwitcherContent({ organizations, orgSlug, pathname, query, onQueryChange, onSelect, onCreate, onSearchKeyDown, onListKeyDown, searchRef, listRef }: OrganizationSwitcherContentProps) {
  const showSearch = organizations.length > 5;
  const effectiveQuery = showSearch ? query : "";
  const matches = filterSwitcherOrganizations(organizations, effectiveQuery);
  return <>
    <header className={styles.heading}>
      <span>Organizations</span>
    </header>
    {showSearch && <div className={styles.search}>
      <Search size={14} aria-hidden="true" />
      <input ref={searchRef} className={styles.searchInput} type="search" aria-label="Search organizations" placeholder="Find an organization…" value={query} onChange={(event) => onQueryChange(event.target.value)} onKeyDown={onSearchKeyDown} maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} />
    </div>}
    <div ref={listRef} className={styles.list} onKeyDown={onListKeyDown}>
      {matches.length ? <nav aria-label="Organizations"><ul className={styles.options}>
        {matches.map((organization) => {
          const current = organization.slug === orgSlug;
          return <li key={organization.id}>
            <Link to={current ? pathname : organizationSwitchDestination(pathname, orgSlug, organization.slug)} search={current ? (previous) => previous : {}} hash={current ? true : ""} data-org-option="" aria-current={current ? "true" : undefined} onClick={(event) => onSelect(organization, event)} className={styles.option}>
              <OrganizationAvatar organization={organization} />
              <span className={styles.identity}><span className={styles.name} title={organization.name}>{organization.name}</span></span>
              {current && <Check size={15} className={styles.check} aria-label="Current organization" />}
            </Link>
          </li>;
        })}
      </ul></nav> : <div className={styles.empty}>
        <Search size={18} aria-hidden="true" /><p>{organizations.length ? "No organizations found" : "No organizations yet"}</p><span>{organizations.length ? "Try another name or slug." : "Create an organization to get started."}</span>
      </div>}
    </div>
    {showSearch && <p className={styles.srOnly} role="status" aria-live="polite">{effectiveQuery.trim() ? `${matches.length} ${matches.length === 1 ? "organization" : "organizations"} found` : ""}</p>}
    <footer className={styles.footer}>
      <Link to="/onboarding" search={{}} hash="" onClick={onCreate} className={styles.create}><Plus size={15} aria-hidden="true" />Create organization</Link>
    </footer>
  </>;
}
