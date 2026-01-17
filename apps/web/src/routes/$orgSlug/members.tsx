import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Plus,
  MoreVertical,
  X,
  Mail,
  Shield,
  AlertCircle,
} from "lucide-react";
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

export const Route = createFileRoute("/$orgSlug/members")({
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
  const remainingSlots =
    memberLimit === -1 ? 999 : Math.max(0, memberLimit - currentMemberCount);

  const handleInviteClick = () => {
    if (isAtLimit) {
      setIsLimitModalOpen(true);
      return;
    }
    setIsInviteModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto relative animate-pulse">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-8 w-32 bg-white/5 rounded mb-2" />
            <div className="h-4 w-64 bg-white/5 rounded" />
          </div>
          <div className="h-10 w-36 bg-white/5 rounded-xl" />
        </div>

        <div className="bg-white/2 border border-white/5 rounded-2xl overflow-hidden mb-6">
          <div className="p-6 border-b border-white/5">
            <div className="h-6 w-32 bg-white/5 rounded" />
          </div>
          <div className="divide-y divide-white/5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/5" />
                  <div>
                    <div className="h-4 w-32 bg-white/5 rounded mb-2" />
                    <div className="h-3 w-48 bg-white/5 rounded" />
                  </div>
                </div>
                <div className="w-8 h-8 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto relative">
      <div className="flex items-start sm:items-center justify-between gap-4 mb-8">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Members
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Manage who has access to this organization · {currentMemberCount} /{" "}
            {memberLimit} members
          </p>
        </div>
        {canInvite && (
          <button
            onClick={handleInviteClick}
            className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl font-medium transition-colors shadow-lg shadow-white/5 shrink-0 ${
              isAtLimit
                ? "bg-white/10 text-gray-400 cursor-not-allowed"
                : "bg-white text-black hover:bg-gray-200"
            }`}
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Invite Member</span>
          </button>
        )}
      </div>

      {isAtLimit && (
        <div className="mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-500">
              Member limit reached
            </p>
            <p className="text-xs text-gray-400 mt-1">
              You've reached your plan's limit of {memberLimit} members.
              {currentPlan !== "free" && remainingSlots === 0 && (
                <>
                  {" "}
                  Go to{" "}
                  <Link
                    to="/$orgSlug/billing"
                    className="text-yellow-500 hover:underline"
                    params={{ orgSlug: selectedOrganization?.slug! }}
                  >
                    Billing
                  </Link>{" "}
                  to add more member slots or upgrade your plan.
                </>
              )}
              {currentPlan === "free" && (
                <> Upgrade to a paid plan to invite more team members.</>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white/2 border border-white/5 rounded-2xl mb-6">
        <div className="p-6 border-b border-white/5 rounded-t-2xl">
          <h3 className="text-lg font-medium text-white">Team Members</h3>
        </div>

        <div className="divide-y divide-white/5">
          {members.map((member) => (
            <div
              key={member.id}
              className="p-4 flex items-center justify-between hover:bg-white/2 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                  {member.user.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-white font-medium">
                      {member.user.name}
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${member.role === "owner" ? "bg-accent/10 text-accent border-accent/20" : "bg-white/5 text-gray-400 border-white/10"}`}
                    >
                      {member.role}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{member.user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 relative">
                {member.role !== "owner" && (canUpdate || canDelete) && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdownId(
                          activeDropdownId === member.id ? null : member.id,
                        );
                      }}
                      className={`p-2 transition-colors rounded-lg ${activeDropdownId === member.id ? "bg-white/10 text-white" : "text-gray-500 hover:text-white hover:bg-white/5"}`}
                    >
                      <MoreVertical size={18} />
                    </button>

                    {activeDropdownId === member.id && (
                      <div
                        ref={dropdownRef}
                        className="absolute right-0 top-full mt-2 w-48 bg-[#101010] border border-white/10 rounded-xl shadow-xl shadow-black/50 overflow-hidden z-50"
                      >
                        <div className="p-1">
                          {canUpdate && (
                            <button
                              onClick={() => {
                                setChangeRoleState({
                                  isOpen: true,
                                  memberId: member.id,
                                  currentRole: member.role as any,
                                });
                                setActiveDropdownId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left"
                            >
                              <Shield size={14} />
                              Change Role
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => {
                                removeMember(member.id);
                                setActiveDropdownId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-left"
                            >
                              <X size={14} />
                              Remove Member
                            </button>
                          )}
                        </div>
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
              className="p-4 flex items-center justify-between hover:bg-white/2 transition-colors opacity-75"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-500 font-bold">
                  <Mail size={18} />
                </div>
                <div>
                  <h4 className="text-gray-400 font-medium">
                    Invited: {invitation.email}
                  </h4>
                  <p className="text-sm text-gray-600">
                    Role: {invitation.role}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-medium border border-yellow-500/20">
                  Pending
                </span>
                {canCancelInvitation && (
                  <button
                    onClick={() => cancelInvitation(invitation.id)}
                    className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {members.length === 0 && invitations.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No members found
            </div>
          )}
        </div>
      </div>

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
