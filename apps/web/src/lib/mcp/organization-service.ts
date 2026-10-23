import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { invitations, members, organizations, users } from "../../db/auth-schema";
import { assertOrganizationMemberCapacity } from "../member-limits.server";
import { withOrganizationQuotaLock } from "../organization-entitlements.server";
import { generateEmail } from "../../email/templates";
import { sendViaZepto } from "../send-email";
import { McpAccessError } from "./policy";
import { listMcpOrganizations } from "./connections";
import { mcpOrigin } from "./config";
import type { McpRequestActor } from "./request-actor";
import type { McpArguments } from "./catalog";
import { uptimeStatusPages } from "../../db/uptime-schema";

export async function requireMcpOrganization(actor: McpRequestActor, slug: string, manager = false) {
  const orgs = await listMcpOrganizations(actor.user.id, actor.organizationIds);
  const org = orgs.find((row) => row.slug === slug);
  if (!org || (manager && !["owner", "admin"].includes(org.role))) {
    throw new McpAccessError("FORBIDDEN", 403, "You do not have access to this operation in this organization");
  }
  return org;
}

export async function runOrganizationTool(operation: string, actor: McpRequestActor, args: McpArguments) {
  if (operation === "profile") return { id: actor.user.id, name: actor.user.name, email: actor.user.email };
  if (operation === "organizations") return { organizations: await listMcpOrganizations(actor.user.id, actor.organizationIds) };
  const org = await requireMcpOrganization(actor, args.orgSlug as string);
  if (operation === "organization") return { organization: org };
  if (operation === "status_pages") return { pages: await db.select({ id: uptimeStatusPages.id, name: uptimeStatusPages.name, slug: uptimeStatusPages.slug, published: uptimeStatusPages.published })
    .from(uptimeStatusPages).where(eq(uptimeStatusPages.organizationId, org.id)).limit(100) };
  if (operation === "billing_link") return { url: `${mcpOrigin()}/${encodeURIComponent(org.slug)}/billing` };
  if (operation === "members") {
    return { members: await db.select({ id: members.id, userId: users.id, name: users.name, email: users.email, role: members.role })
      .from(members).innerJoin(users, eq(users.id, members.userId)).where(eq(members.organizationId, org.id)).limit(500) };
  }
  await requireMcpOrganization(actor, org.slug, true);
  if (operation === "notification_link") {
    const target = args.alertId ? `observability/alerts/${encodeURIComponent(String(args.alertId))}` : "uptime";
    return { url: `${mcpOrigin()}/api/${encodeURIComponent(org.slug)}/${target}/integrations/${encodeURIComponent(String(args.provider))}/start`,
      message: "Open this OutRay link in your browser to authorize the destination." };
  }
  if (operation === "invitations") return { invitations: await db.select({ id: invitations.id, email: invitations.email, role: invitations.role,
    status: invitations.status, createdAt: invitations.createdAt, expiresAt: invitations.expiresAt })
    .from(invitations).where(eq(invitations.organizationId, org.id)).limit(500) };

  const result = await db.transaction(async (tx) => {
    await withOrganizationQuotaLock(tx, org.id);
    const current = await tx.select().from(members).where(eq(members.organizationId, org.id)).for("update");
    const acting = current.find((member) => member.userId === actor.user.id);
    if (!acting || !["owner", "admin"].includes(acting.role)) throw new McpAccessError("FORBIDDEN", 403, "Organization manager permission is required");
    if (operation === "update_organization") {
      const [updated] = await tx.update(organizations).set({ name: args.name as string }).where(eq(organizations.id, org.id))
        .returning({ id: organizations.id, name: organizations.name, slug: organizations.slug });
      return { organization: updated };
    }
    if (operation === "invite") {
      const email = (args.email as string).toLowerCase();
      const [existingMember] = await tx.select({ id: members.id }).from(members).innerJoin(users, eq(users.id, members.userId))
        .where(and(eq(members.organizationId, org.id), sql`lower(${users.email}) = ${email}`)).limit(1);
      const existingInvitations = await tx.select({ id: invitations.id }).from(invitations).where(and(
        eq(invitations.organizationId, org.id), sql`lower(${invitations.email}) = ${email}`,
        sql`${invitations.status} IN ('pending', 'accepted')`, sql`${invitations.expiresAt} > now()`,
      )).limit(1);
      if (existingMember || existingInvitations.length) throw new McpAccessError("CONFLICT", 409, "This email already has membership or a pending invitation");
      await assertOrganizationMemberCapacity(org.id, { includePendingInvitations: true }, tx);
      const [invitation] = await tx.insert(invitations).values({ id: crypto.randomUUID(), organizationId: org.id,
        email, role: args.role as string, status: "pending", inviterId: actor.user.id, expiresAt: new Date(Date.now() + 48 * 3600000),
      }).returning({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt });
      return { invitation };
    }
    if (operation === "cancel_invitation") {
      const [invitation] = await tx.update(invitations).set({ status: "canceled" }).where(and(
        eq(invitations.id, args.invitationId as string), eq(invitations.organizationId, org.id), eq(invitations.status, "pending"),
      )).returning({ id: invitations.id });
      if (!invitation) throw new McpAccessError("NOT_FOUND", 404, "Pending invitation not found");
      return { invitation };
    }
    const target = current.find((member) => member.id === args.memberId);
    if (!target) throw new McpAccessError("NOT_FOUND", 404, "Member not found");
    if ((target.role === "owner" || args.role === "owner") && acting.role !== "owner") {
      throw new McpAccessError("FORBIDDEN", 403, "Only owners can change owner membership");
    }
    if (target.role === "owner" && args.role !== "owner" && current.filter((member) => member.role === "owner").length <= 1) {
      throw new McpAccessError("LAST_OWNER", 409, "The organization must retain an owner");
    }
    if (operation === "member_role") {
      await tx.update(members).set({ role: args.role as string }).where(and(eq(members.id, target.id), eq(members.organizationId, org.id)));
      return { member: { id: target.id, role: args.role } };
    }
    if (operation === "remove_member") {
      await tx.delete(members).where(and(eq(members.id, target.id), eq(members.organizationId, org.id)));
      return { removed: true, memberId: target.id };
    }
    throw new McpAccessError("UNAVAILABLE_TOOL", 404, "Unknown organization operation");
  });
  if ("invitation" in result && operation === "invite" && result.invitation && "email" in result.invitation && "role" in result.invitation) {
    const invitation = result.invitation;
    const { html, subject } = generateEmail("organization-invite", {
      inviterName: actor.user.name, organizationName: org.name, role: String(invitation.role ?? "member"),
      invitationLink: `${mcpOrigin()}/invitations/accept?token=${encodeURIComponent(invitation.id)}`,
    });
    try { await sendViaZepto({ recipientEmail: String(invitation.email), subject, htmlString: html }); }
    catch { return { ...result, emailDelivery: "failed", message: "Invitation created, but the email could not be delivered. Resend it from OutRay." }; }
  }
  return result;
}
