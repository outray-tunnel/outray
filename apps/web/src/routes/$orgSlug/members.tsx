import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { authClient, usePermission } from "@/lib/auth-client";
import { appClient } from "@/lib/app-client";
import { getPlanLimits, isUnlimitedPlanLimit, type SubscriptionPlan } from "@/lib/subscription-plans";
import { Button } from "@/components/arc/button/button";
import { ChangeRoleModal } from "@/components/change-role-modal";
import InviteMemberModal from "@/components/invite-member-modal";
import { MembersContent, type MembersTab } from "@/components/workspace/members-content";
import { activeWorkspaceInvitations, canManageWorkspaceMember, workspaceInviteValidation, type WorkspaceInvitation, type WorkspaceMember, type WorkspaceMemberRole } from "@/components/workspace/members-data";
import { WorkspaceDialog, WorkspaceNotice } from "@/components/workspace/workspace-ui";

export const Route = createFileRoute("/$orgSlug/members")({
  head: () => ({ meta: [{ title: "Members - OutRay" }] }),
  component: MembersView,
});

const membersKey = (organizationId: string) => ["members", organizationId] as const;
const invitationsKey = (organizationId: string) => ["invitations", organizationId] as const;
type Confirmation = { kind: "remove" | "cancel"; id: string; name: string };

function MembersView() {
  const { orgSlug } = Route.useParams();
  return <MembersWorkspace key={orgSlug} orgSlug={orgSlug} />;
}

function MembersWorkspace({ orgSlug }: { orgSlug: string }) {
  const { data: session } = authClient.useSession();
  const { data: organizations, isPending: isLoadingOrganizations, error: organizationsError } = authClient.useListOrganizations();
  const selectedOrganizationId = organizations?.find((organization) => organization.slug === orgSlug)?.id;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<MembersTab>("members");
  const [search, setSearch] = useState("");
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceMemberRole>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [roleMember, setRoleMember] = useState<WorkspaceMember | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  // Guard the event boundary too, before React Query's pending state re-renders.
  const pendingAction = useRef(false);

  const { data: canInvite } = usePermission({ member: ["create"] });
  const { data: canUpdate } = usePermission({ member: ["update"] });
  const { data: canDelete } = usePermission({ member: ["delete"] });
  const { data: canCancelInvitation } = usePermission({ invitation: ["cancel"] });

  const subscriptionQuery = useQuery({
    queryKey: ["subscription", orgSlug],
    queryFn: async () => {
      const response = await appClient.subscriptions.get(orgSlug);
      if ("error" in response) throw new Error(response.error);
      return response;
    },
    enabled: !!selectedOrganizationId,
  });
  const membersQuery = useQuery({
    queryKey: ["members", selectedOrganizationId],
    queryFn: async () => {
      const response = await authClient.organization.listMembers({ query: { organizationId: selectedOrganizationId! } });
      if (response.error) throw new Error(response.error.message || "Could not load workspace members.");
      return response.data?.members || [];
    },
    enabled: !!selectedOrganizationId,
  });
  const invitationsQuery = useQuery({
    queryKey: ["invitations", selectedOrganizationId],
    queryFn: async () => {
      const response = await authClient.organization.listInvitations({ query: { organizationId: selectedOrganizationId! } });
      if (response.error) throw new Error(response.error.message || "Could not load pending invitations.");
      return activeWorkspaceInvitations(response.data || []);
    },
    enabled: !!selectedOrganizationId,
  });

  const inviteMutation = useMutation({
    mutationFn: async ({ email, role, organizationId }: { email: string; role: WorkspaceMemberRole; organizationId: string }) => {
      const response = await authClient.organization.inviteMember({ email, role, organizationId });
      if (response.error) throw new Error(response.error.message || "Failed to invite member.");
      return response.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: invitationsKey(variables.organizationId) });
      setInviteEmail("");
      setIsInviteModalOpen(false);
    },
    onError: (error: Error) => setInviteError(error.message),
    onSettled: () => { pendingAction.current = false; },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async ({ invitationId }: { invitationId: string; organizationId: string }) => {
      const response = await authClient.organization.cancelInvitation({ invitationId });
      if (response.error) throw new Error(response.error.message || "Failed to cancel invitation.");
      return response.data;
    },
    onMutate: async ({ invitationId, organizationId }) => {
      const queryKey = invitationsKey(organizationId);
      await queryClient.cancelQueries({ queryKey });
      const previousInvitations = queryClient.getQueryData<WorkspaceInvitation[]>(queryKey);
      queryClient.setQueryData<WorkspaceInvitation[]>(queryKey, (old) => old?.filter((invitation) => invitation.id !== invitationId) || []);
      return { previousInvitations, queryKey };
    },
    onSuccess: () => setConfirmation(null),
    onError: (error: Error, _variables, context) => {
      if (context?.previousInvitations !== undefined) queryClient.setQueryData(context.queryKey, context.previousInvitations);
      setConfirmationError(error.message);
    },
    onSettled: async (_data, _error, variables) => {
      await queryClient.invalidateQueries({ queryKey: invitationsKey(variables.organizationId) });
      pendingAction.current = false;
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ memberId, organizationId }: { memberId: string; organizationId: string }) => {
      const response = await authClient.organization.removeMember({ memberIdOrEmail: memberId, organizationId });
      if (response.error) throw new Error(response.error.message || "Failed to remove member.");
      return response.data;
    },
    onMutate: async ({ memberId, organizationId }) => {
      const queryKey = membersKey(organizationId);
      await queryClient.cancelQueries({ queryKey });
      const previousMembers = queryClient.getQueryData<WorkspaceMember[]>(queryKey);
      queryClient.setQueryData<WorkspaceMember[]>(queryKey, (old) => old?.filter((member) => member.id !== memberId) || []);
      return { previousMembers, queryKey };
    },
    onSuccess: () => setConfirmation(null),
    onError: (error: Error, _variables, context) => {
      if (context?.previousMembers !== undefined) queryClient.setQueryData(context.queryKey, context.previousMembers);
      setConfirmationError(error.message);
    },
    onSettled: async (_data, _error, variables) => {
      await queryClient.invalidateQueries({ queryKey: membersKey(variables.organizationId) });
      pendingAction.current = false;
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role, organizationId }: { memberId: string; role: WorkspaceMemberRole; organizationId: string }) => {
      const response = await authClient.organization.updateMemberRole({ memberId, role, organizationId });
      if (response.error) throw new Error(response.error.message || "Failed to update member role.");
      return response.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: membersKey(variables.organizationId) });
      setRoleMember(null);
    },
    onError: (error: Error) => setRoleError(error.message),
    onSettled: () => { pendingAction.current = false; },
  });

  const members = membersQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];
  const currentPlan = (subscriptionQuery.data?.subscription?.plan || "free") as SubscriptionPlan;
  const memberLimit = getPlanLimits(currentPlan).maxMembers;
  const unlimitedSeats = isUnlimitedPlanLimit(currentPlan, memberLimit);
  const hasData = !!selectedOrganizationId && membersQuery.data !== undefined && invitationsQuery.data !== undefined && subscriptionQuery.data !== undefined;
  const loading = isLoadingOrganizations || membersQuery.isLoading || invitationsQuery.isLoading || subscriptionQuery.isLoading;
  const loadError = membersQuery.error?.message || invitationsQuery.error?.message || subscriptionQuery.error?.message || organizationsError?.message || (!isLoadingOrganizations && !selectedOrganizationId ? "This workspace could not be found." : null);
  const isFetching = membersQuery.isFetching || invitationsQuery.isFetching || subscriptionQuery.isFetching;
  const busy = inviteMutation.isPending || updateRoleMutation.isPending || removeMemberMutation.isPending || cancelInvitationMutation.isPending;

  function handleInviteClick() {
    if (!canInvite || !hasData || pendingAction.current) return;
    if (!unlimitedSeats && members.length + invitations.length >= memberLimit) { setIsLimitModalOpen(true); return; }
    setInviteError(null);
    setInviteRole("member");
    setIsInviteModalOpen(true);
  }

  function handleInvite(event: FormEvent) {
    event.preventDefault();
    if (pendingAction.current) return;
    if (!canInvite) { setInviteError("You no longer have permission to invite workspace members."); return; }
    if (!selectedOrganizationId || !hasData) { setInviteError("Workspace information is unavailable. Close this dialog and try loading the members again."); return; }
    const error = workspaceInviteValidation({ email: inviteEmail, members, invitations, memberLimit, unlimited: unlimitedSeats });
    setInviteError(error);
    if (error) return;
    pendingAction.current = true;
    inviteMutation.mutate({ email: inviteEmail.trim().toLowerCase(), role: inviteRole, organizationId: selectedOrganizationId });
  }

  function openRoleDialog(member: WorkspaceMember) {
    if (!canManageWorkspaceMember(member, canUpdate) || pendingAction.current) return;
    setRoleError(null);
    setRoleMember(member);
  }

  function handleRoleChange(role: WorkspaceMemberRole) {
    if (pendingAction.current) return;
    const member = members.find((member) => member.id === roleMember?.id);
    if (!member) { setRoleError("This member is no longer in the workspace. Close this dialog and refresh the list."); return; }
    if (!canManageWorkspaceMember(member, canUpdate)) { setRoleError(member.role === "owner" ? "Workspace owners are protected from role changes." : "You no longer have permission to change member roles."); return; }
    if (!selectedOrganizationId || role === member.role) return;
    setRoleError(null);
    pendingAction.current = true;
    updateRoleMutation.mutate({ memberId: member.id, role, organizationId: selectedOrganizationId });
  }

  function openConfirmation(target: Confirmation) {
    if (pendingAction.current) return;
    if (target.kind === "cancel" && !canCancelInvitation) return;
    if (target.kind === "remove") {
      const member = members.find((member) => member.id === target.id);
      if (!member || !canManageWorkspaceMember(member, canDelete)) return;
    }
    setConfirmationError(null);
    setConfirmation(target);
  }

  function handleConfirmation() {
    if (!confirmation || !selectedOrganizationId || pendingAction.current) return;
    setConfirmationError(null);
    if (confirmation.kind === "cancel") {
      if (!canCancelInvitation) { setConfirmationError("You no longer have permission to cancel invitations."); return; }
      if (!invitations.some((invitation) => invitation.id === confirmation.id)) { setConfirmationError("This invitation is no longer pending. Close this dialog and refresh the list."); return; }
      pendingAction.current = true;
      cancelInvitationMutation.mutate({ invitationId: confirmation.id, organizationId: selectedOrganizationId });
    } else {
      const member = members.find((member) => member.id === confirmation.id);
      if (!member) { setConfirmationError("This member is no longer in the workspace. Close this dialog and refresh the list."); return; }
      if (!canManageWorkspaceMember(member, canDelete)) { setConfirmationError(member.role === "owner" ? "Workspace owners cannot be removed." : "You no longer have permission to remove members."); return; }
      pendingAction.current = true;
      removeMemberMutation.mutate({ memberId: confirmation.id, organizationId: selectedOrganizationId });
    }
  }

  function retry() {
    void membersQuery.refetch();
    void invitationsQuery.refetch();
    void subscriptionQuery.refetch();
  }

  const viewPlans = <Link to="/$orgSlug/billing" params={{ orgSlug }} className="inline-flex min-h-7 items-center text-[12px] text-zinc-300 hover:text-white focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">View plans</Link>;
  const confirmationPending = removeMemberMutation.isPending || cancelInvitationMutation.isPending;

  return <>
    <MembersContent members={hasData ? members : undefined} invitations={hasData ? invitations : undefined} currentUserId={session?.user.id} loading={loading} isFetching={isFetching} error={loadError} canInvite={canInvite} canUpdate={canUpdate} canDelete={canDelete} canCancelInvitation={canCancelInvitation} busy={busy} tab={tab} search={search} seatLimit={memberLimit} unlimitedSeats={unlimitedSeats} limitAction={viewPlans} onTabChange={setTab} onSearchChange={setSearch} onInvite={handleInviteClick} onChangeRole={openRoleDialog} onRemove={(member) => openConfirmation({ kind: "remove", id: member.id, name: member.user.name || member.user.email })} onCancelInvitation={(invitation) => openConfirmation({ kind: "cancel", id: invitation.id, name: invitation.email })} onRetry={retry} />

    <InviteMemberModal open={isInviteModalOpen} handleInvite={handleInvite} inviteEmail={inviteEmail} setInviteEmail={(email) => { setInviteEmail(email); setInviteError(null); }} inviteRole={inviteRole} setInviteRole={setInviteRole} setIsInviteModalOpen={(open) => { if (!pendingAction.current) setIsInviteModalOpen(open); }} inviteMutation={inviteMutation} error={inviteError} />

    <ChangeRoleModal key={roleMember?.id} isOpen={!!roleMember} onClose={() => { if (!pendingAction.current) setRoleMember(null); }} currentRole={(roleMember?.role || "member") as WorkspaceMemberRole} memberName={roleMember?.user.name || roleMember?.user.email} onConfirm={handleRoleChange} isPending={updateRoleMutation.isPending} error={roleError} />

    <WorkspaceDialog open={!!confirmation} onClose={() => { if (!pendingAction.current) setConfirmation(null); }} title={confirmation?.kind === "remove" ? "Remove member" : "Cancel invitation"} description={confirmation?.kind === "remove" ? "This person will lose access to the workspace." : "This invitation will no longer be available to accept."} size="sm" busy={confirmationPending} footer={<>
      <Button type="button" variant="secondary" size="sm" onClick={() => { if (!pendingAction.current) setConfirmation(null); }} disabled={confirmationPending}>Keep {confirmation?.kind === "remove" ? "member" : "invitation"}</Button>
      <Button type="button" variant="danger" size="sm" onClick={handleConfirmation} loading={confirmationPending}>{confirmation?.kind === "remove" ? "Remove member" : "Cancel invitation"}</Button>
    </>}>
      <div className="space-y-3">{confirmationError && <WorkspaceNotice message={confirmationError} />}<p className="break-words text-[13px] leading-6 text-zinc-400">{confirmation?.kind === "remove" ? <>Remove <span className="text-zinc-200">{confirmation.name}</span> from this workspace?</> : <>Cancel the invitation for <span className="text-zinc-200">{confirmation?.name}</span>?</>}</p></div>
    </WorkspaceDialog>

    <WorkspaceDialog open={isLimitModalOpen} onClose={() => setIsLimitModalOpen(false)} title="Member seats are full" description="Pending invitations also reserve a member seat." size="sm" footer={<><Button type="button" size="sm" variant="secondary" onClick={() => setIsLimitModalOpen(false)}>Close</Button>{viewPlans}</>}>
      <p className="text-[13px] leading-6 text-zinc-400">Your <span className="capitalize text-zinc-200">{currentPlan}</span> plan includes {memberLimit} {memberLimit === 1 ? "member seat" : "member seats"}. Cancel a pending invitation or upgrade your plan to invite more people.</p>
    </WorkspaceDialog>
  </>;
}
