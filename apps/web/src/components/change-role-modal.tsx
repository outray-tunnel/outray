import { useId, useState } from "react";
import { Button } from "./arc/button/button";
import { Select } from "./arc/select/select";
import { workspaceMemberRoles, type WorkspaceMemberRole } from "./workspace/members-data";
import { WorkspaceDialog, WorkspaceNotice } from "./workspace/workspace-ui";

interface ChangeRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: WorkspaceMemberRole;
  memberName?: string;
  onConfirm: (role: WorkspaceMemberRole) => void;
  isPending: boolean;
  error?: string | null;
}

export function ChangeRoleModal(props: ChangeRoleModalProps) {
  return props.isOpen ? <ChangeRoleDialog key={props.currentRole} {...props} /> : null;
}

function ChangeRoleDialog({ isOpen, onClose, currentRole, memberName, onConfirm, isPending, error }: ChangeRoleModalProps) {
  const [selectedRole, setSelectedRole] = useState<WorkspaceMemberRole>(currentRole);
  const formId = useId();
  const close = () => { if (!isPending) onClose(); };
  const selectedRoleData = workspaceMemberRoles.find((role) => role.value === selectedRole);

  return <WorkspaceDialog open={isOpen} onClose={close} title="Change member role" description={memberName ? `Update workspace access for ${memberName}.` : "Update this member's workspace access."} busy={isPending} size="md" footer={<>
    <Button type="button" size="sm" variant="secondary" onClick={close} disabled={isPending}>Cancel</Button>
    <Button type="submit" size="sm" form={formId} disabled={selectedRole === currentRole} loading={isPending}>Update role</Button>
  </>}>
    <form id={formId} className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!isPending && selectedRole !== currentRole) onConfirm(selectedRole); }}>
      {error && <WorkspaceNotice message={error} />}
      <Select label="Role" value={selectedRole} onValueChange={(value) => setSelectedRole(value as WorkspaceMemberRole)} options={[...workspaceMemberRoles]} description={selectedRoleData?.description} disabled={isPending} />
    </form>
  </WorkspaceDialog>;
}
