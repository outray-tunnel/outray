import { useState, type ReactNode } from "react";
import { Building2, Check, Mail, ShieldCheck, Users, UserRound } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { CopyButton } from "../arc/copy-button/copy-button";
import { Button } from "../arc/button/button";
import { WorkspaceEmptyState, WorkspaceNotice } from "./workspace-ui";
import styles from "./settings-content.module.css";

export interface SettingsIdentity {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified: boolean;
}

export interface SettingsOrganization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
}

function IdentityAvatar({ name, image, organization = false }: { name: string; image?: string | null; organization?: boolean }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => [...part][0]).join("").toUpperCase();
  return <span className={styles.avatar} data-organization={organization} aria-hidden="true">
    {image && failedImage !== image
      ? <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} />
      : initials || (organization ? <Building2 size={20} /> : <UserRound size={20} />)}
  </span>;
}

function DetailRow({ label, children, copy, mono = false }: { label: string; children: ReactNode; copy?: string; mono?: boolean }) {
  return <div className={styles.detailRow}>
    <dt>{label}</dt>
    <dd><span className={styles.detailValue} data-mono={mono}>{children}</span>
      {copy ? <CopyButton iconOnly variant="plain" value={copy} label={`Copy ${label.toLowerCase()}`} /> : null}
    </dd>
  </div>;
}

export function ProfileSettingsContent({ user }: { user: SettingsIdentity }) {
  return <div className={styles.grid}>
    <div className={styles.sectionIntro}>
      <h2>Personal profile</h2>
      <p>Your account identity across OutRay workspaces.</p>
    </div>
    <section className={styles.panel} aria-label="Personal profile">
      <div className={styles.identity}>
        <IdentityAvatar name={user.name} image={user.image} />
        <div className="min-w-0"><h3>{user.name || "Your account"}</h3><p>{user.email}</p></div>
      </div>
      <dl className={styles.details}>
        <DetailRow label="Full name">{user.name || "Not provided"}</DetailRow>
        <DetailRow label="Email address" copy={user.email}><span className={styles.email}><Mail size={14} aria-hidden="true" />{user.email}</span></DetailRow>
        <DetailRow label="Email verification"><span className={styles.badge} data-verified={user.emailVerified}>
          {user.emailVerified ? <Check size={12} aria-hidden="true" /> : <Mail size={12} aria-hidden="true" />}
          {user.emailVerified ? "Verified" : "Not verified"}
        </span></DetailRow>
      </dl>
      <p className={styles.panelNote}><ShieldCheck size={14} aria-hidden="true" />These account details are currently read-only.</p>
    </section>
  </div>;
}

export function OrganizationSettingsContent({ organization, orgSlug }: { organization: SettingsOrganization; orgSlug: string }) {
  return <div className={styles.grid}>
    <div className={styles.sectionIntro}>
      <h2>Workspace identity</h2>
      <p>The organization your team and resources belong to.</p>
    </div>
    <div className="min-w-0 space-y-4">
      <section className={styles.panel} aria-label="Organization identity">
        <div className={styles.identity}>
          <IdentityAvatar name={organization.name} image={organization.logo} organization />
          <div className="min-w-0"><h3>{organization.name}</h3><p>Organization</p></div>
        </div>
        <dl className={styles.details}>
          <DetailRow label="Organization name">{organization.name}</DetailRow>
          <DetailRow label="Organization slug" copy={organization.slug} mono>{organization.slug}</DetailRow>
          <DetailRow label="Organization ID" copy={organization.id} mono>{organization.id}</DetailRow>
        </dl>
        <p className={styles.panelNote}><ShieldCheck size={14} aria-hidden="true" />These organization details are currently read-only.</p>
      </section>
      <Link to="/$orgSlug/members" params={{ orgSlug }} className={styles.relatedLink}>
        <Users size={16} aria-hidden="true" /><span><span className={styles.relatedTitle}>Members and access</span><span className={styles.relatedDescription}>See who belongs to this workspace.</span></span><span className="ml-auto text-zinc-500" aria-hidden="true">→</span>
      </Link>
    </div>
  </div>;
}

export function SettingsLoading() {
  return <div className={styles.grid} aria-label="Loading settings" aria-busy="true">
    <div className="space-y-3"><div className={styles.skeleton} style={{ width: 140, height: 16 }} /><div className={styles.skeleton} style={{ width: "85%", height: 12 }} /></div>
    <div className={styles.panel}><div className={styles.identity}><div className={styles.skeleton} style={{ width: 44, height: 44 }} /><div className="space-y-2"><div className={styles.skeleton} style={{ width: 160, height: 14 }} /><div className={styles.skeleton} style={{ width: 200, maxWidth: "40vw", height: 12 }} /></div></div>
      {[0, 1, 2].map((row) => <div className={styles.detailRow} key={row}><div className={styles.skeleton} style={{ width: 100, height: 12 }} /><div className={styles.skeleton} style={{ width: "45%", height: 14 }} /></div>)}
    </div>
  </div>;
}

export function SettingsUnavailable({ error, onRetry }: { error?: boolean; onRetry: () => void }) {
  return error
    ? <WorkspaceNotice message="Could not load these settings." action={<Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>} />
    : <div className={styles.panel}><WorkspaceEmptyState icon={<Building2 size={20} />} title="Settings unavailable" description="Account or workspace details could not be found. Refresh to check your access." action={<Button variant="secondary" size="sm" onClick={onRetry}>Refresh settings</Button>} /></div>;
}
