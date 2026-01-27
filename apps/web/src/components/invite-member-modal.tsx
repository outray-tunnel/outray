import { X, Mail, Shield } from "lucide-react";
import { Modal, Button, Input, Label, Select, IconButton } from "@/components/ui";

type Role = "member" | "admin" | "owner";

interface InviteMemberModalProps {
  setIsInviteModalOpen: (isOpen: boolean) => void;
  inviteEmail: string;
  setInviteEmail: (email: string) => void;
  inviteRole: Role;
  setInviteRole: (role: Role) => void;
  inviteMutation: {
    isPending: boolean;
  };
  handleInvite: (e: React.FormEvent) => void;
}

const roles = [
  {
    value: "member",
    label: "Member",
    description: "Can view and contribute to projects",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Can manage members and settings",
  },
  {
    value: "owner",
    label: "Owner",
    description: "Full access to all features and settings",
  },
];

export default function InviteMemberModal({
  setIsInviteModalOpen,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  inviteMutation,
  handleInvite,
}: InviteMemberModalProps) {
  const selectedRole = roles.find((r) => r.value === inviteRole);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#101010] border border-white/10 rounded-2xl overflow-hidden w-full max-w-md shadow-2xl">
        <div className="p-6 border-b border-white/10 flex items-center justify-between rounded-t-2xl">
          <h3 className="text-xl font-bold text-white">Invite Member</h3>
          <IconButton
            onClick={() => setIsInviteModalOpen(false)}
            icon={<X size={20} />}
            aria-label="Close"
          />
        </div>
        <form onSubmit={handleInvite} className="p-6 space-y-4">
          <div>
            <Label>Email Address</Label>
            <Input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              leftIcon={<Mail size={18} />}
            />
          </div>

          {/* Custom Role Dropdown */}
          <div>
            <Label>Role</Label>
            <Select
              options={roles}
              value={inviteRole}
              onChange={(value) => setInviteRole(value as Role)}
              icon={<Shield size={18} />}
            />
            <p className="mt-2 text-xs text-gray-400">
              {selectedRole?.description}
            </p>
          </div>

          <div className="pt-2 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsInviteModalOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={inviteMutation.isPending}
              isLoading={inviteMutation.isPending}
              className="flex-1"
            >
              {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
