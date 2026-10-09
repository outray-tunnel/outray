import type { ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Mail, Plus, RefreshCw, Search, Users } from "lucide-react";
import Cancel01Icon from "@hugeicons-pro/core-stroke-rounded/Cancel01Icon";
import ShieldUserIcon from "@hugeicons-pro/core-stroke-rounded/ShieldUserIcon";
import { Button } from "../arc/button/button";
import { SearchField } from "../arc/search-field/search-field";
import { ActionMenu } from "../secrets/secrets-ui";
import { WorkspacePageHeader } from "../workspace-page-header";
import { WorkspaceEmptyState, WorkspaceNotice } from "./workspace-ui";
import { canManageWorkspaceMember, filterWorkspaceInvitations, filterWorkspaceMembers, type WorkspaceInvitation, type WorkspaceMember } from "./members-data";
import "../outray-arc-theme.css";

export type MembersTab = "members" | "invitations";

export interface MembersContentProps {
  members?: WorkspaceMember[];
  invitations?: WorkspaceInvitation[];
  currentUserId?: string;
  loading?: boolean;
  isFetching?: boolean;
  error?: string | null;
  canInvite: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canCancelInvitation: boolean;
  busy?: boolean;
  tab: MembersTab;
  search: string;
  seatLimit: number;
  unlimitedSeats?: boolean;
  limitAction?: ReactNode;
  onTabChange: (tab: MembersTab) => void;
  onSearchChange: (value: string) => void;
  onInvite: () => void;
  onChangeRole: (member: WorkspaceMember) => void;
  onRemove: (member: WorkspaceMember) => void;
  onCancelInvitation: (invitation: WorkspaceInvitation) => void;
  onRetry: () => void;
}

const rowClassName = "grid min-h-[68px] min-w-0 grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025] motion-reduce:transition-none sm:grid-cols-[minmax(0,1fr)_120px_32px]";
const tabClassName = "inline-flex min-h-9 items-center gap-2 border-b-2 border-transparent px-1 text-[12px] text-zinc-500 transition-colors hover:text-zinc-200 data-[state=active]:border-zinc-300 data-[state=active]:text-zinc-200 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

export function MembersContent({ members, invitations, currentUserId, loading, isFetching, error, canInvite, canUpdate, canDelete, canCancelInvitation, busy, tab, search, seatLimit, unlimitedSeats, limitAction, onTabChange, onSearchChange, onInvite, onChangeRole, onRemove, onCancelInvitation, onRetry }: MembersContentProps) {
  const hasData = members !== undefined && invitations !== undefined;
  const visibleMembers = filterWorkspaceMembers(members ?? [], search);
  const visibleInvitations = filterWorkspaceInvitations(invitations ?? [], search);
  const usedSeats = (members?.length ?? 0) + (invitations?.length ?? 0);
  const atLimit = hasData && !unlimitedSeats && usedSeats >= seatLimit;
  const inviteButton = canInvite ? <Button size="md" aria-haspopup="dialog" onClick={onInvite} disabled={!hasData || busy}><Plus size={14} aria-hidden="true" />Invite member</Button> : undefined;

  return <div className="outray-arc mx-auto w-full max-w-[1440px] space-y-5">
    <WorkspacePageHeader appearance="compact" title="Members" description="The people with access to your workspace, and what they can do." action={inviteButton} />

    {error && hasData && <WorkspaceNotice message="Could not refresh members. Showing the last available data." action={<Button size="sm" variant="ghost" onClick={onRetry} loading={isFetching}>Retry</Button>} />}
    {atLimit && <WorkspaceNotice tone="info" message={`All ${seatLimit} ${seatLimit === 1 ? "member seat is" : "member seats are"} in use, including pending invitations.`} action={limitAction} />}

    {!hasData ? loading || !error ? <MembersSkeleton /> : <section role="alert" className="rounded-xl border border-white/[0.08]">
      <WorkspaceEmptyState icon={<Users size={21} aria-hidden="true" />} title="Could not load members" description={error} action={<Button variant="secondary" size="sm" onClick={onRetry} loading={isFetching}><RefreshCw size={13} aria-hidden="true" />Try again</Button>} />
    </section> : <Tabs.Root value={tab} onValueChange={(value) => onTabChange(value as MembersTab)} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/[0.07]">
        <Tabs.List aria-label="Workspace team" className="flex items-center gap-5">
          <Tabs.Trigger value="members" className={tabClassName}>Members<span className="text-[11px] tabular-nums text-zinc-500">{members.length}</span></Tabs.Trigger>
          <Tabs.Trigger value="invitations" className={tabClassName}>Pending invitations<span className="text-[11px] tabular-nums text-zinc-500">{invitations.length}</span></Tabs.Trigger>
        </Tabs.List>
        <span className="pb-2 text-[11px] tabular-nums text-zinc-500">{usedSeats} {unlimitedSeats ? "seats used · unlimited" : `of ${seatLimit} seats used`}</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="outray-arc-requests-search min-w-0 flex-1 sm:max-w-[360px]"><SearchField appearance="workspace" label={tab === "members" ? "Search members" : "Search invitations"} placeholder={tab === "members" ? "Find by name, email, or role…" : "Find by email or role…"} value={search} onValueChange={onSearchChange} maxLength={200} autoComplete="off" spellCheck={false} /></div>
        {isFetching && <span role="status" className="pb-2 text-[11px] text-zinc-500">Updating</span>}
      </div>

      <Tabs.Content value="members" className="rounded-xl border border-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {!members.length ? <WorkspaceEmptyState icon={<Users size={21} aria-hidden="true" />} title="No members yet" description="Invite someone to collaborate in this workspace." action={inviteButton} /> : !visibleMembers.length ? <SearchEmptyState onClear={() => onSearchChange("")} /> : <>
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_120px_32px] gap-3 border-b border-white/[0.07] bg-white/[0.015] px-4 py-2.5 text-[11px] text-zinc-500 sm:grid"><span>Member</span><span>Role</span><span /></div>
          <ul aria-label="Workspace members" className="divide-y divide-white/[0.06]">{visibleMembers.map((member) => <MemberRow key={member.id} member={member} isYou={member.userId === currentUserId} canUpdate={canUpdate} canDelete={canDelete} busy={busy} onChangeRole={onChangeRole} onRemove={onRemove} />)}</ul>
          <ListFooter visible={visibleMembers.length} total={members.length} label="members" />
        </>}
      </Tabs.Content>

      <Tabs.Content value="invitations" className="rounded-xl border border-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {!invitations.length ? <WorkspaceEmptyState icon={<Mail size={21} aria-hidden="true" />} title="No pending invitations" description="People you've invited will appear here until they join or their invitation expires." /> : !visibleInvitations.length ? <SearchEmptyState onClear={() => onSearchChange("")} /> : <>
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_120px_32px] gap-3 border-b border-white/[0.07] bg-white/[0.015] px-4 py-2.5 text-[11px] text-zinc-500 sm:grid"><span>Email</span><span>Role</span><span /></div>
          <ul aria-label="Pending workspace invitations" className="divide-y divide-white/[0.06]">{visibleInvitations.map((invitation) => <InvitationRow key={invitation.id} invitation={invitation} canCancel={canCancelInvitation} busy={busy} onCancel={onCancelInvitation} />)}</ul>
          <ListFooter visible={visibleInvitations.length} total={invitations.length} label="invitations" />
        </>}
      </Tabs.Content>
    </Tabs.Root>}
  </div>;
}

function MemberRow({ member, isYou, canUpdate, canDelete, busy, onChangeRole, onRemove }: { member: WorkspaceMember; isYou: boolean; canUpdate: boolean; canDelete: boolean; busy?: boolean; onChangeRole: (member: WorkspaceMember) => void; onRemove: (member: WorkspaceMember) => void }) {
  const name = member.user.name?.trim() || member.user.email;
  const actions = [
    ...(canManageWorkspaceMember(member, canUpdate) ? [{ label: "Change role", icon: ShieldUserIcon, onSelect: () => onChangeRole(member), disabled: busy }] : []),
    ...(canManageWorkspaceMember(member, canDelete) ? [{ label: "Remove member", icon: Cancel01Icon, onSelect: () => onRemove(member), danger: true, disabled: busy }] : []),
  ];
  return <li className={rowClassName}>
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.07] bg-white/[0.045] text-[11px] font-medium text-zinc-400" aria-hidden="true">{member.user.image ? <img src={member.user.image} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : name.charAt(0).toUpperCase()}</span>
      <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><p className="truncate text-[13px] text-zinc-200" title={name}>{name}</p>{isYou && <span className="rounded bg-white/[0.045] px-1.5 py-0.5 text-[10px] text-zinc-500">You</span>}</div><p className="mt-0.5 truncate text-[11px] text-zinc-500" title={member.user.email}>{member.user.email}</p></div>
    </div>
    <RoleBadge role={member.role} />
    <div className="flex justify-end">{actions.length > 0 && <ActionMenu compact label={`Actions for ${name}`} items={actions} />}</div>
  </li>;
}

function InvitationRow({ invitation, canCancel, busy, onCancel }: { invitation: WorkspaceInvitation; canCancel: boolean; busy?: boolean; onCancel: (invitation: WorkspaceInvitation) => void }) {
  const expiresAt = new Date(invitation.expiresAt);
  const validExpiry = Number.isFinite(expiresAt.getTime());
  return <li className={rowClassName}>
    <div className="flex min-w-0 items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.025] text-zinc-500"><Mail size={14} aria-hidden="true" /></span><div className="min-w-0"><p className="truncate text-[13px] text-zinc-200" title={invitation.email}>{invitation.email}</p><p className="mt-0.5 truncate text-[11px] text-zinc-500">Pending{validExpiry && <> · Expires <time dateTime={expiresAt.toISOString()}>{expiresAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></>}</p></div></div>
    <RoleBadge role={invitation.role || "member"} />
    <div className="flex justify-end">{canCancel && <ActionMenu compact label={`Actions for invitation to ${invitation.email}`} items={[{ label: "Cancel invitation", icon: Cancel01Icon, danger: true, disabled: busy, onSelect: () => onCancel(invitation) }]} />}</div>
  </li>;
}

function SearchEmptyState({ onClear }: { onClear: () => void }) {
  return <WorkspaceEmptyState icon={<Search size={21} aria-hidden="true" />} title="No matches found" description="Try another name, email address, or role." action={<Button variant="ghost" size="sm" onClick={onClear}>Clear search</Button>} />;
}

function RoleBadge({ role }: { role: string }) {
  return <span className="w-fit rounded-md border border-white/[0.06] bg-white/[0.035] px-2 py-1 text-[11px] capitalize leading-none text-zinc-400"><span className="sr-only">Role: </span>{role}</span>;
}

function ListFooter({ visible, total, label }: { visible: number; total: number; label: string }) {
  return <footer className="border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-zinc-500" role="status">Showing {visible} of {total} {label}</footer>;
}

function MembersSkeleton() {
  return <section aria-label="Loading members" aria-busy="true" className="animate-pulse space-y-4 motion-reduce:animate-none"><span className="sr-only">Loading members</span><div aria-hidden="true" className="flex h-10 items-center gap-5 border-b border-white/[0.07]"><span className="h-3 w-20 rounded bg-white/[0.06]" /><span className="h-3 w-32 rounded bg-white/[0.04]" /></div><div aria-hidden="true" className="h-9 max-w-[360px] rounded-lg bg-white/[0.04]" /><div aria-hidden="true" className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08]">{[0, 1, 2].map((row) => <div key={row} className={rowClassName}><div className="flex items-center gap-3"><span className="size-8 shrink-0 rounded-full bg-white/[0.05]" /><div className="min-w-0"><div className="h-3 w-28 max-w-full rounded bg-white/[0.06]" /><div className="mt-2 h-2.5 w-40 max-w-full rounded bg-white/[0.04]" /></div></div><span className="h-3 w-12 rounded bg-white/[0.04]" /><span /></div>)}</div></section>;
}
