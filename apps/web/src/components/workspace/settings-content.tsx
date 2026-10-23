import { useState, type ReactNode } from "react";
import { Building2, Check, Mail, ShieldCheck, Users, UserRound } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { CopyButton } from "../arc/copy-button/copy-button";
import { Button } from "../arc/button/button";
import { WorkspaceEmptyState, WorkspaceNotice } from "./workspace-ui";
import { OrganizationLogoUpload, type OrganizationLogoFeedback } from "./organization-logo-upload";

const settingsGridClassName = "grid grid-cols-[minmax(180px,260px)_minmax(0,680px)] items-start gap-8 max-[900px]:grid-cols-[minmax(0,1fr)] max-[900px]:gap-5";
const sectionIntroClassName = "pt-1 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:tracking-[-.02em] [&_h2]:text-zinc-200 [&_p]:mt-[7px] [&_p]:max-w-[245px] [&_p]:text-xs [&_p]:leading-[1.7] [&_p]:text-[#8b8b94] max-[900px]:[&_p]:max-w-none";
const settingsPanelClassName = "min-w-0 overflow-hidden rounded-[14px] border border-white/[.08] bg-[#101010]";
const identityClassName = "flex items-center gap-[13px] px-6 py-[22px] [&_h3]:text-sm [&_h3]:font-medium [&_h3]:tracking-[-.025em] [&_h3]:text-zinc-200 [&_h3]:[overflow-wrap:anywhere] [&_p]:mt-[3px] [&_p]:text-xs [&_p]:text-[#8b8b94] [&_p]:[overflow-wrap:anywhere] max-[540px]:p-5";
const avatarClassName = "grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-white/[.09] bg-[#202020] text-sm font-medium text-zinc-300 data-[organization=true]:rounded-xl [&_img]:size-full [&_img]:object-cover";
const detailRowClassName = "flex min-h-16 items-center justify-between gap-6 border-t border-white/[.07] px-6 py-4 [&_dt]:basis-[150px] [&_dt]:text-xs [&_dt]:text-[#8b8b94] [&_dd]:m-0 [&_dd]:flex [&_dd]:min-w-0 [&_dd]:items-center [&_dd]:justify-end [&_dd]:gap-2 [&_dd]:text-[13px] [&_dd]:text-zinc-300 max-[540px]:flex-col max-[540px]:items-start max-[540px]:gap-2 max-[540px]:px-5 max-[540px]:py-[15px] max-[540px]:[&_dt]:basis-auto max-[540px]:[&_dd]:w-full max-[540px]:[&_dd]:justify-between";
const detailValueClassName = "min-w-0 [overflow-wrap:anywhere] data-[mono=true]:font-mono data-[mono=true]:text-xs";
const panelNoteClassName = "m-0 flex items-center gap-[7px] border-t border-white/[.07] px-6 py-3.5 text-[11px] leading-[1.6] text-[#8b8b94] [&_svg]:shrink-0 max-[540px]:px-5";
const settingsSkeletonClassName = "shrink-0 animate-pulse rounded-md bg-white/[.07] motion-reduce:animate-none";

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
  return <span className={avatarClassName} data-organization={organization} aria-hidden="true">
    {image && failedImage !== image
      ? <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} />
      : initials || (organization ? <Building2 size={20} /> : <UserRound size={20} />)}
  </span>;
}

function DetailRow({ label, children, copy, mono = false }: { label: string; children: ReactNode; copy?: string; mono?: boolean }) {
  return <div className={detailRowClassName}>
    <dt>{label}</dt>
    <dd><span className={detailValueClassName} data-mono={mono}>{children}</span>
      {copy ? <CopyButton iconOnly variant="plain" value={copy} label={`Copy ${label.toLowerCase()}`} /> : null}
    </dd>
  </div>;
}

export function ProfileSettingsContent({ user, appearance = "default" }: { user: SettingsIdentity; appearance?: "default" | "stacked" }) {
  return <div className={appearance === "stacked" ? "space-y-4" : settingsGridClassName}>
    <div className={`${sectionIntroClassName} ${appearance === "stacked" ? "[&_p]:max-w-none" : ""}`}>
      <h2>Personal profile</h2>
      <p>Your account identity across OutRay workspaces.</p>
    </div>
    <section className={settingsPanelClassName} aria-label="Personal profile">
      <div className={identityClassName}>
        <IdentityAvatar name={user.name} image={user.image} />
        <div className="min-w-0"><h3>{user.name || "Your account"}</h3><p>{user.email}</p></div>
      </div>
      <dl className="m-0">
        <DetailRow label="Full name">{user.name || "Not provided"}</DetailRow>
        <DetailRow label="Email address" copy={user.email}><span className="flex items-center gap-[7px] [overflow-wrap:anywhere] [&_svg]:shrink-0 [&_svg]:text-zinc-500"><Mail size={14} aria-hidden="true" />{user.email}</span></DetailRow>
        <DetailRow label="Email verification"><span className="inline-flex items-center gap-1.25 whitespace-nowrap rounded-md border border-white/[.08] bg-white/[.025] px-2 py-[3px] text-[11px] text-zinc-400 data-[verified=true]:border-emerald-400/14 data-[verified=true]:bg-emerald-400/[.04] data-[verified=true]:text-emerald-300" data-verified={user.emailVerified}>
          {user.emailVerified ? <Check size={12} aria-hidden="true" /> : <Mail size={12} aria-hidden="true" />}
          {user.emailVerified ? "Verified" : "Not verified"}
        </span></DetailRow>
      </dl>
      <p className={panelNoteClassName}><ShieldCheck size={14} aria-hidden="true" />These account details are currently read-only.</p>
    </section>
  </div>;
}

export function OrganizationSettingsContent({ organization, orgSlug, canUploadLogo = false, onLogoUpdated, appearance = "default" }: {
  organization: SettingsOrganization;
  orgSlug: string;
  canUploadLogo?: boolean;
  onLogoUpdated?: (url: string) => void;
  appearance?: "default" | "stacked";
}) {
  const [uploadedLogo, setUploadedLogo] = useState<{ url: string; previous: typeof organization.logo } | null>(null);
  const [logoFeedback, setLogoFeedback] = useState<OrganizationLogoFeedback | null>(null);
  const logo = uploadedLogo && uploadedLogo.previous === organization.logo ? uploadedLogo.url : organization.logo;
  return <div className={appearance === "stacked" ? "space-y-4" : settingsGridClassName}>
    <div className={`${sectionIntroClassName} ${appearance === "stacked" ? "[&_p]:max-w-none" : ""}`}>
      <h2>Workspace identity</h2>
      <p>The organization your team and resources belong to.</p>
    </div>
    <div className="min-w-0 space-y-4">
      <section className={settingsPanelClassName} aria-label="Organization identity">
        <div className={identityClassName}>
          {canUploadLogo ? <OrganizationLogoUpload orgSlug={orgSlug} name={organization.name} image={logo}
            onUploaded={(url) => { setUploadedLogo({ url, previous: organization.logo }); onLogoUpdated?.(url); }} onFeedback={setLogoFeedback} />
            : <IdentityAvatar name={organization.name} image={logo} organization />}
          <div className="min-w-0"><h3>{organization.name}</h3><p>Organization</p>
            {logoFeedback ? <p role={logoFeedback.error ? "alert" : "status"} className={`mt-1! text-[11px]! ${logoFeedback.error ? "text-rose-300!" : "text-emerald-300!"}`}>{logoFeedback.message}</p> : null}
          </div>
        </div>
        <dl className="m-0">
          <DetailRow label="Organization name">{organization.name}</DetailRow>
          <DetailRow label="Organization slug" copy={organization.slug} mono>{organization.slug}</DetailRow>
          <DetailRow label="Organization ID" copy={organization.id} mono>{organization.id}</DetailRow>
        </dl>
        <p className={panelNoteClassName}><ShieldCheck size={14} aria-hidden="true" />{canUploadLogo ? "Organization names and identifiers are currently read-only." : "These organization details are currently read-only."}</p>
      </section>
      <Link to="/$orgSlug/members" params={{ orgSlug }} className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.015] px-[18px] py-4 text-zinc-400 transition-[background,border-color] duration-[140ms] hover:border-white/[.13] hover:bg-white/[.035] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#8367c7] motion-reduce:transition-none">
        <Users size={16} aria-hidden="true" /><span><span className="block text-[13px] text-zinc-300">Members and access</span><span className="mt-[3px] block text-xs text-[#8b8b94]">See who belongs to this workspace.</span></span><span className="ml-auto text-zinc-500" aria-hidden="true">→</span>
      </Link>
    </div>
  </div>;
}

export function SettingsLoading() {
  return <div className={settingsGridClassName} aria-label="Loading settings" aria-busy="true">
    <div className="space-y-3"><div className={`${settingsSkeletonClassName} h-4 w-[140px]`} /><div className={`${settingsSkeletonClassName} h-3 w-[85%]`} /></div>
    <div className={settingsPanelClassName}><div className={identityClassName}><div className={`${settingsSkeletonClassName} size-11`} /><div className="space-y-2"><div className={`${settingsSkeletonClassName} h-3.5 w-40`} /><div className={`${settingsSkeletonClassName} h-3 w-[200px] max-w-[40vw]`} /></div></div>
      {[0, 1, 2].map((row) => <div className={detailRowClassName} key={row}><div className={`${settingsSkeletonClassName} h-3 w-[100px]`} /><div className={`${settingsSkeletonClassName} h-3.5 w-[45%]`} /></div>)}
    </div>
  </div>;
}

export function SettingsUnavailable({ error, onRetry }: { error?: boolean; onRetry: () => void }) {
  return error
    ? <WorkspaceNotice message="Could not load these settings." action={<Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>} />
    : <div className={settingsPanelClassName}><WorkspaceEmptyState icon={<Building2 size={20} />} title="Settings unavailable" description="Account or workspace details could not be found. Refresh to check your access." action={<Button variant="secondary" size="sm" onClick={onRetry}>Refresh settings</Button>} /></div>;
}
