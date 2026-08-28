import { createFileRoute, Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Alert02Icon,
  Cancel01Icon,
  Mail01Icon,
  MoreVerticalIcon,
  ShieldUserIcon,
  UserGroupIcon,
} from "@hugeicons-pro/core-stroke-rounded";
import { authClient, usePermission } from "@/lib/auth-client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPlanLimits } from "@/lib/subscription-plans";
import { appClient } from "@/lib/app-client";
import { AlertModal } from "@/components/alert-modal";
import { LimitModal } from "@/components/limit-modal";
import { ConfirmModal } from "@/components/confirm-modal";
import { ChangeRoleModal } from "@/components/change-role-modal";
import { useEffect, useRef } from "react";
import InviteMemberModal from "@/components/invite-member-modal";
import { WorkspacePageHeader } from "@/components/workspace-page-header";

export const Route = createFileRoute("/$orgSlug/members")({
  head: () => ({
    meta: [
      { title: "Members - OutRay" },
    ],
  }),
  component: MembersView,
});

function MembersView() {
  const { orgSlug } = Route.useParams();
  const { selectedOrganization } = useAppStore();
  const selectedOrganizationId = selectedOrganization?.id;
  const queryClient = useQueryClient();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin" | "owner">(
    "member",
  );
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [changeRoleState, setChangeRoleState] = useState<{
    isOpen: boolean;
    memberId: string;
    currentRole: "member" | "admin" | "owner";
  }>({
    isOpen: false,
    memberId: "",
    currentRole: "member",
  });

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setActiveDropdownId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "error" | "info" | "success";
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "error",
  });
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive: boolean;
    confirmText: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDestructive: false,
    confirmText: "Confirm",
  });

  const { data: canInvite } = usePermission({
    member: ["create"],
  });

  const { data: canUpdate } = usePermission({
    member: ["update"],
  });

  const { data: canDelete } = usePermission({
    member: ["delete"],
  });

  const { data: canCancelInvitation } = usePermission({
    invitation: ["cancel"],
  });

  const { data: subscriptionData, isLoading: isLoadingSubscription } = useQuery(
    {
      queryKey: ["subscription", orgSlug],
      queryFn: async () => {
        if (!orgSlug) return null;
        const response = await appClient.subscriptions.get(orgSlug);
        if ("error" in response) throw new Error(response.error);
        return response;
      },
      enabled: !!selectedOrganizationId,
    },
  );

  const { data: membersData, isLoading: isLoadingMembers } = useQuery({
    queryKey: ["members", selectedOrganizationId],
    queryFn: async () => {
      if (!selectedOrganizationId) return [];
      const res = await authClient.organization.listMembers({
        query: {
          organizationId: selectedOrganizationId,
        },
      });
      return res.data?.members || [];
    },
    enabled: !!selectedOrganizationId,
  });

  const { data: invitationsData, isLoading: isLoadingInvitations } = useQuery({
    queryKey: ["invitations", selectedOrganizationId],
    queryFn: async () => {
      if (!selectedOrganizationId) return [];
      const res = await authClient.organization.listInvitations({
        query: {
          organizationId: selectedOrganizationId,
        },
      });
      // Filter out cancelled and accepted invitations
      const activeInvitations = (res.data || []).filter(
        (inv: any) =>
          inv.status !== "canceled" &&
          inv.status !== "cancelled" &&
          inv.status !== "accepted",
      );
      return activeInvitations;
    },
    enabled: !!selectedOrganizationId,
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: {
      email: string;
      role: "member" | "admin" | "owner";
    }) => {
      const res = await authClient.organization.inviteMember({
        email: data.email,
        role: data.role,
        organizationId: selectedOrganizationId!,
      });
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["invitations", selectedOrganizationId],
      });
      setInviteEmail("");
      setIsInviteModalOpen(false);
    },
    onError: (error: Error) => {
      setAlertState({
        isOpen: true,
        title: "Invitation Failed",
        message: error.message || "Failed to invite member",
        type: "error",
      });
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onMutate: async (invitationId) => {
      // Optimistic update
      await queryClient.cancelQueries({
        queryKey: ["invitations", selectedOrganizationId],
      });
      const previousInvitations = queryClient.getQueryData([
        "invitations",
        selectedOrganizationId,
      ]);
      queryClient.setQueryData(
        ["invitations", selectedOrganizationId],
        (old: any[]) => old?.filter((inv) => inv.id !== invitationId) || [],
      );
      return { previousInvitations };
    },
    onError: (error: Error, _invitationId, context) => {
      // Revert on error
      if (context?.previousInvitations) {
        queryClient.setQueryData(
          ["invitations", selectedOrganizationId],
          context.previousInvitations,
        );
      }
      setAlertState({
        isOpen: true,
        title: "Cancellation Failed",
        message: error.message || "Failed to cancel invitation",
        type: "error",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["invitations", selectedOrganizationId],
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await authClient.organization.removeMember({
        memberIdOrEmail: memberId,
        organizationId: selectedOrganizationId!,
      });
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onMutate: async (memberId) => {
      // Optimistic update
      await queryClient.cancelQueries({
        queryKey: ["members", selectedOrganizationId],
      });
      const previousMembers = queryClient.getQueryData([
        "members",
        selectedOrganizationId,
      ]);
      queryClient.setQueryData(
        ["members", selectedOrganizationId],
        (old: any[]) => old?.filter((member) => member.id !== memberId) || [],
      );
      return { previousMembers };
    },
    onError: (error: Error, _memberId, context) => {
      // Revert on error
      if (context?.previousMembers) {
        queryClient.setQueryData(
          ["members", selectedOrganizationId],
          context.previousMembers,
        );
      }
      setAlertState({
        isOpen: true,
        title: "Removal Failed",
        message: error.message || "Failed to remove member",
        type: "error",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["members", selectedOrganizationId],
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (data: {
      memberId: string;
      role: "member" | "admin" | "owner";
    }) => {
      const res = await authClient.organization.updateMemberRole({
        memberId: data.memberId,
        role: data.role,
        organizationId: selectedOrganizationId!,
      });
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["members", selectedOrganizationId],
      });
      setChangeRoleState((prev) => ({ ...prev, isOpen: false }));
    },
    onError: (error: Error) => {
      setAlertState({
        isOpen: true,
        title: "Update Failed",
        message: error.message || "Failed to update member role",
        type: "error",
      });
    },
  });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const cancelInvitation = async (invitationId: string) => {
    setConfirmState({
      isOpen: true,
      title: "Cancel Invitation",
      message: "Are you sure you want to cancel this invitation?",
      onConfirm: () => cancelInvitationMutation.mutate(invitationId),
      isDestructive: true,
      confirmText: "Cancel Invitation",
    });
  };

  const removeMember = async (memberId: string) => {
    setConfirmState({
      isOpen: true,
      title: "Remove Member",
      message: "Are you sure you want to remove this member?",
      onConfirm: () => removeMemberMutation.mutate(memberId),
      isDestructive: true,
      confirmText: "Remove Member",
    });
  };

  const members = membersData || [];
  const invitations = invitationsData || [];
  const isLoading =
    isLoadingMembers || isLoadingInvitations || isLoadingSubscription;

  const subscription = subscriptionData?.subscription;
  const currentPlan = subscription?.plan || "free";
  const planLimits = getPlanLimits(currentPlan as any);

  const currentMemberCount = members.length + invitations.length;
  const memberLimit = planLimits.maxMembers;
  const isAtLimit =
    memberLimit === -1 ? false : currentMemberCount >= memberLimit;

  const handleInviteClick = () => {
    if (isAtLimit) {
      setIsLimitModalOpen(true);
      return;
    }
    setIsInviteModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="relative mx-auto max-w-6xl animate-pulse space-y-7">
        <header className="flex items-end justify-between gap-6 border-b border-white/[0.07] pb-7">
          <div className="flex-1">
            <div className="mb-3 h-2 w-16 rounded bg-white/[0.04]" />
            <div className="h-6 w-28 rounded bg-white/[0.07]" />
            <div className="mt-3 h-3 w-72 max-w-full rounded bg-white/[0.04]" />
          </div>
          <div className="h-9 w-9 rounded-md bg-white/[0.07] sm:w-32" />
        </header>

        <section className="border-y border-white/[0.07]">
          <div className="flex items-center justify-between border-b border-white/[0.07] py-4">
            <div className="h-3 w-24 rounded bg-white/[0.06]" />
            <div className="h-2.5 w-16 rounded bg-white/[0.04]" />
          </div>
          <div className="divide-y divide-white/[0.07]">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3.5 py-4">
                <div className="size-8 rounded-full bg-white/[0.05]" />
                <div className="flex-1">
                  <div className="h-3 w-32 rounded bg-white/[0.06]" />
                  <div className="mt-2 h-2.5 w-44 rounded bg-white/[0.04]" />
                </div>
                <div className="h-3 w-16 rounded bg-white/[0.04]" />
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-6xl space-y-7">
      <WorkspacePageHeader
        title="Members"
        description={
          <>
            Manage workspace access · {currentMemberCount} of{" "}
            {memberLimit === -1 ? "∞" : memberLimit} seats used
          </>
        }
        action={
          canInvite ? (
          <button
            type="button"
            onClick={handleInviteClick}
            disabled={isAtLimit}
            className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-white px-3.5 text-[12px] font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.9} />
            <span className="hidden sm:inline">Invite member</span>
          </button>
          ) : undefined
        }
      />

      {isAtLimit && (
        <aside className="flex flex-col gap-4 border-y border-white/[0.07] py-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-400/[0.08] text-amber-300">
              <HugeiconsIcon icon={Alert02Icon} size={15} strokeWidth={1.8} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12px] font-medium text-zinc-200">
                  Member seats are full
                </p>
                <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-amber-300/70">
                  {memberLimit} of {memberLimit} used
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">
                Your {currentPlan} plan has no remaining member seats.
              </p>
            </div>
          </div>
          <Link
            to="/$orgSlug/billing"
            params={{ orgSlug }}
            className="ml-11 text-[11px] font-medium text-zinc-300 hover:text-white sm:ml-0"
          >
            View plans
          </Link>
        </aside>
      )}

      <section className="border-y border-white/[0.07]">
        <div className="flex items-center justify-between border-b border-white/[0.07] py-4">
          <h2 className="text-xs font-medium text-zinc-300">Team members</h2>
          <span className="text-[10px] text-zinc-700">
            {members.length} active · {invitations.length} pending
          </span>
        </div>

        <div className="divide-y divide-white/[0.07]">
          {members.map((member) => (
            <div
              key={member.id}
              className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_100px_32px] sm:items-center"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-medium text-zinc-300">
                  {member.user.name?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-xs font-medium text-zinc-300">
                    {member.user.name}
                  </h3>
                  <p className="mt-1 truncate text-[11px] text-zinc-600">
                    {member.user.email}
                  </p>
                </div>
              </div>
              <span className="w-fit text-[10px] font-medium capitalize text-zinc-600">
                {member.role}
              </span>
              <div className="relative flex items-center">
                {member.role !== "owner" && (canUpdate || canDelete) && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdownId(
                          activeDropdownId === member.id ? null : member.id,
                        );
                      }}
                      className={`flex size-8 items-center justify-center rounded-md transition-colors ${activeDropdownId === member.id ? "bg-white/[0.08] text-zinc-300" : "text-zinc-700 hover:bg-white/[0.04] hover:text-zinc-400"}`}
                      aria-label={`Actions for ${member.user.name}`}
                    >
                      <HugeiconsIcon
                        icon={MoreVerticalIcon}
                        size={14}
                        strokeWidth={1.7}
                      />
                    </button>

                    {activeDropdownId === member.id && (
                      <div
                        ref={dropdownRef}
                        className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg border border-white/[0.09] bg-[#0a0a0a] p-1 shadow-2xl shadow-black/60"
                      >
                          {canUpdate && (
                            <button
                              type="button"
                              onClick={() => {
                                setChangeRoleState({
                                  isOpen: true,
                                  memberId: member.id,
                                  currentRole: member.role as any,
                                });
                                setActiveDropdownId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
                            >
                              <HugeiconsIcon
                                icon={ShieldUserIcon}
                                size={13}
                                strokeWidth={1.7}
                              />
                              Change role
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                removeMember(member.id);
                                setActiveDropdownId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[11px] text-red-400/70 transition-colors hover:bg-red-500/[0.08] hover:text-red-400"
                            >
                              <HugeiconsIcon
                                icon={Cancel01Icon}
                                size={13}
                                strokeWidth={1.7}
                              />
                              Remove member
                            </button>
                          )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_100px_32px] sm:items-center"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.035] text-zinc-700">
                  <HugeiconsIcon icon={Mail01Icon} size={14} strokeWidth={1.7} />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-xs font-medium text-zinc-500">
                    {invitation.email}
                  </h3>
                  <p className="mt-1 text-[11px] capitalize text-zinc-700">
                    {invitation.role} invitation
                  </p>
                </div>
              </div>
              <span className="w-fit text-[10px] font-medium text-amber-300/60">
                Pending
              </span>
              <div>
                {canCancelInvitation && (
                  <button
                    type="button"
                    onClick={() => cancelInvitation(invitation.id)}
                    className="flex size-8 items-center justify-center rounded-md text-zinc-700 hover:bg-red-500/[0.08] hover:text-red-400"
                    aria-label="Cancel invitation"
                  >
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      size={14}
                      strokeWidth={1.7}
                    />
                  </button>
                )}
              </div>
            </div>
          ))}

          {members.length === 0 && invitations.length === 0 && (
            <div className="flex min-h-64 flex-col items-center justify-center py-12 text-center">
              <HugeiconsIcon
                icon={UserGroupIcon}
                size={27}
                strokeWidth={1.5}
                className="mb-4 text-zinc-700"
              />
              <h3 className="text-sm font-medium text-zinc-300">No members</h3>
              <p className="mt-2 text-xs text-zinc-700">
                Invite someone to start collaborating in this workspace.
              </p>
            </div>
          )}
        </div>
      </section>

      {isInviteModalOpen && (
        <InviteMemberModal
          handleInvite={handleInvite}
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          inviteRole={inviteRole}
          setInviteRole={setInviteRole}
          setIsInviteModalOpen={setIsInviteModalOpen}
          inviteMutation={inviteMutation}
        />
      )}

      <LimitModal
        isOpen={isLimitModalOpen}
        onClose={() => setIsLimitModalOpen(false)}
        title="Member Limit Reached"
        description={`You've reached your plan's limit of ${memberLimit} members. Upgrade your plan to invite more members.`}
        limit={memberLimit}
        currentPlan={currentPlan}
        resourceName="Team Members"
      />

      <ChangeRoleModal
        isOpen={changeRoleState.isOpen}
        onClose={() =>
          setChangeRoleState((prev) => ({ ...prev, isOpen: false }))
        }
        currentRole={changeRoleState.currentRole}
        onConfirm={(role) =>
          updateRoleMutation.mutate({
            memberId: changeRoleState.memberId,
            role,
          })
        }
        isPending={updateRoleMutation.isPending}
      />

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState((prev) => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive={confirmState.isDestructive}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
