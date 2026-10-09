import { useId, type FormEvent } from "react";
import { Button } from "./arc/button/button";
import { Select } from "./arc/select/select";
import { WorkspaceInput } from "./ui/workspace-input";
import { workspaceMemberRoles, type WorkspaceMemberRole } from "./workspace/members-data";
import { WorkspaceDialog, WorkspaceNotice } from "./workspace/workspace-ui";

interface InviteMemberModalProps {
  open?: boolean;
  setIsInviteModalOpen: (isOpen: boolean) => void;
  inviteEmail: string;
  setInviteEmail: (email: string) => void;
  inviteRole: WorkspaceMemberRole;
  setInviteRole: (role: WorkspaceMemberRole) => void;
  inviteMutation: { isPending: boolean };
  handleInvite: (event: FormEvent) => void;
  error?: string | null;
}

export default function InviteMemberModal({ open = true, setIsInviteModalOpen, inviteEmail, setInviteEmail, inviteRole, setInviteRole, inviteMutation, handleInvite, error }: InviteMemberModalProps) {
  const formId = useId();
  const emailId = useId();
  const close = () => { if (!inviteMutation.isPending) setIsInviteModalOpen(false); };
  const selectedRole = workspaceMemberRoles.find((role) => role.value === inviteRole);

  return <WorkspaceDialog open={open} onClose={close} title="Invite member" description="Send an invitation to join this workspace." busy={inviteMutation.isPending} size="md" footer={<>
    <Button type="button" size="sm" variant="secondary" onClick={close} disabled={inviteMutation.isPending}>Cancel</Button>
    <Button type="submit" size="sm" form={formId} loading={inviteMutation.isPending}>Send invitation</Button>
  </>}>
    <form id={formId} onSubmit={(event) => { if (inviteMutation.isPending) { event.preventDefault(); return; } handleInvite(event); }} className="space-y-4">
      {error && <WorkspaceNotice message={error} />}
      <div className="space-y-2"><label htmlFor={emailId} className="block text-[12px] text-zinc-400">Email address</label><WorkspaceInput id={emailId} name="email" type="email" required autoComplete="email" placeholder="colleague@example.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} disabled={inviteMutation.isPending} /></div>
      <Select label="Role" value={inviteRole} onValueChange={(value) => setInviteRole(value as WorkspaceMemberRole)} options={[...workspaceMemberRoles]} description={selectedRole?.description} disabled={inviteMutation.isPending} />
    </form>
  </WorkspaceDialog>;
}
