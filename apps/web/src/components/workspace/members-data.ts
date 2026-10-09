export type WorkspaceMemberRole = "member" | "admin" | "owner";

export interface WorkspaceMember {
  id: string;
  role: string;
  userId: string;
  user: { name?: string | null; email: string; image?: string | null };
}

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role?: string | null;
  status: string;
  expiresAt: string | Date;
}

export const workspaceMemberRoles = [
  { value: "member", label: "Member", description: "Manage resources without access to billing or member settings." },
  { value: "admin", label: "Admin", description: "Manage resources, billing, and workspace members." },
  { value: "owner", label: "Owner", description: "Full workspace access, including deleting the workspace." },
] as const;

export function activeWorkspaceInvitations<T extends WorkspaceInvitation>(invitations: T[], now = Date.now()): T[] {
  return invitations.filter((invitation) => invitation.status === "pending" && new Date(invitation.expiresAt).getTime() > now);
}

export function filterWorkspaceMembers(members: WorkspaceMember[], query: string) {
  const search = query.trim().toLowerCase();
  return members.filter((member) => !search || `${member.user.name ?? ""} ${member.user.email} ${member.role}`.toLowerCase().includes(search));
}

export function filterWorkspaceInvitations(invitations: WorkspaceInvitation[], query: string) {
  const search = query.trim().toLowerCase();
  return invitations.filter((invitation) => !search || `${invitation.email} ${invitation.role ?? "member"}`.toLowerCase().includes(search));
}

// Owners are deliberately protected, including the workspace's last owner.
export function canManageWorkspaceMember(member: Pick<WorkspaceMember, "role">, permission: boolean) {
  return permission && member.role !== "owner";
}

export function workspaceInviteValidation({ email, members, invitations, memberLimit, unlimited }: {
  email: string;
  members: WorkspaceMember[];
  invitations: WorkspaceInvitation[];
  memberLimit: number;
  unlimited: boolean;
}): string | null {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return "Enter a valid email address.";
  if (members.some((member) => member.user.email.toLowerCase() === normalizedEmail)) return "This person is already a workspace member.";
  if (invitations.some((invitation) => invitation.email.toLowerCase() === normalizedEmail)) return "An invitation is already pending for this email address.";
  if (!unlimited && members.length + invitations.length >= memberLimit) return "All member seats are in use. Cancel a pending invitation or upgrade your plan to invite someone else.";
  return null;
}
