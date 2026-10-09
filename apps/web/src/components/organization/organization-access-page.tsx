import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, Plus, Search, X } from "lucide-react";
import { Button } from "../arc/button/button";
import { OrganizationAvatar } from "../sidebar/organization-switcher-content";
import { filterSwitcherOrganizations, type SwitcherOrganization } from "../sidebar/organization-switcher-state";
import { WorkspaceInput } from "../ui/workspace-input";
import "../outray-arc-theme.css";
import styles from "./organization-access-page.module.css";

export interface OrganizationAccessPageProps {
  organizations: SwitcherOrganization[];
  orgSlug: string;
  isSelectRoute?: boolean;
  remainingPath?: string;
}

function OrganizationAccessShell({ children }: { children: ReactNode }) {
  return <div className={`outray-arc ${styles.page}`}>
    <header className={styles.header}>
      <Link to="/" search={{}} hash="" className={styles.brand} aria-label="OutRay home">
        <img src="/logo.png" width={28} height={28} alt="" />
        <span>OutRay</span>
      </Link>
      <Link to="/" search={{}} hash="" className={styles.home}>
        <ArrowLeft size={14} aria-hidden="true" />Back to home
      </Link>
    </header>
    <main className={styles.main}>{children}</main>
  </div>;
}

export function OrganizationAccessPage({ organizations, orgSlug, isSelectRoute = false, remainingPath = "" }: OrganizationAccessPageProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const showSearch = organizations.length > 5;
  const effectiveQuery = showSearch ? query : "";
  const matches = filterSwitcherOrganizations(organizations, effectiveQuery);

  return <OrganizationAccessShell>
    <section className={styles.content} aria-labelledby="organization-access-title">
      <div className={styles.icon} aria-hidden="true"><Building2 size={22} strokeWidth={1.5} /></div>
      <div className={styles.heading}>
        <h1 id="organization-access-title">{isSelectRoute ? "Choose an organization" : "Organization not found"}</h1>
        <p>{isSelectRoute ? "Choose where you’d like to continue." : <>
          <span className={styles.unavailableSlug}>{orgSlug}</span> is unavailable or you don’t have access. Choose another organization, or ask its owner for an invitation.
        </>}</p>
      </div>

      <div className={styles.panel}>
        <div className={styles.listHeading}>
          <h2>Your organizations</h2>
          <span>{organizations.length} available</span>
        </div>
        {showSearch && <div className={styles.search}>
          <Search size={15} className={styles.searchIcon} aria-hidden="true" />
          <WorkspaceInput ref={searchRef} type="search" size="compact" aria-label="Search organizations" placeholder="Find an organization…" value={query}
            onChange={(event) => setQuery(event.target.value)} maxLength={200} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          {query && <Button type="button" variant="ghost" size="sm" className={styles.clearSearch} aria-label="Clear organization search" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={14} aria-hidden="true" /></Button>}
        </div>}
        {matches.length ? <nav className={styles.list} aria-label="Organizations">
          <ul className={styles.options}>
            {matches.map((organization) => {
              const base = `/${encodeURIComponent(organization.slug)}`;
              const destination = isSelectRoute && remainingPath ? `${base}/${remainingPath}` : `${base}/tunnel`;
              return <li key={organization.id}>
                <Link to={destination} search={{}} hash="" className={styles.organization} data-org-option="">
                  <OrganizationAvatar organization={organization} className={styles.avatar} />
                  <span className={styles.identity}>
                    <span className={styles.name} title={organization.name}>{organization.name}</span>
                    <span className={styles.slug} title={organization.slug}>{organization.slug}</span>
                  </span>
                  <ArrowRight size={16} className={styles.arrow} aria-hidden="true" />
                </Link>
              </li>;
            })}
          </ul>
        </nav> : <div className={styles.empty}>
          <p>{organizations.length ? "No organizations found" : "No organizations yet"}</p>
          <span>{organizations.length ? "Try another name or slug." : "Create an organization to get started."}</span>
        </div>}
        <div className={styles.panelFooter}>
          <Link to="/onboarding" search={{}} hash="" className={styles.create}><Plus size={15} aria-hidden="true" />Create organization</Link>
        </div>
      </div>
      {showSearch && <p className={styles.srOnly} role="status" aria-live="polite">{effectiveQuery.trim() ? `${matches.length} ${matches.length === 1 ? "organization" : "organizations"} found` : ""}</p>}
    </section>
  </OrganizationAccessShell>;
}

export function OrganizationAccessSkeleton() {
  return <OrganizationAccessShell>
    <div className={styles.content} role="status" aria-label="Loading organizations" aria-busy="true">
      <div aria-hidden="true">
        <div className={`${styles.icon} ${styles.skeleton}`} />
        <div className={styles.heading}>
          <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
          <div className={`${styles.skeleton} ${styles.skeletonDescription}`} />
          <div className={`${styles.skeleton} ${styles.skeletonDescriptionShort}`} />
        </div>
        <div className={styles.panel}>
          <div className={styles.listHeading}><div className={`${styles.skeleton} ${styles.skeletonLabel}`} /></div>
          {[0, 1].map((row) => <div key={row} className={styles.skeletonRow}>
            <div className={`${styles.skeleton} ${styles.skeletonAvatar}`} />
            <div className={styles.identity}>
              <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
              <div className={`${styles.skeleton} ${styles.skeletonSlug}`} />
            </div>
          </div>)}
          <div className={styles.panelFooter}><div className={`${styles.skeleton} ${styles.skeletonLabel}`} /></div>
        </div>
      </div>
    </div>
  </OrganizationAccessShell>;
}
