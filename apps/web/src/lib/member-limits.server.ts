import { APIError } from "better-auth/api";
import { sql } from "drizzle-orm";

import { db } from "../db";
import { getOrganizationPlan } from "./organization-entitlements.server";
import {
  getMemberLimitMessage,
  hasAvailableMemberSeat,
} from "./member-limit-policy";

type MemberCapacityOptions = {
  includePendingInvitations?: boolean;
  /** Accepting an invitation transfers its reservation to this member. */
  excludeInvitationEmail?: string;
};
type MemberCapacityDatabase = Pick<typeof db, "select" | "execute">;

export async function assertOrganizationMemberCapacity(
  organizationId: string,
  options: MemberCapacityOptions = {},
  database: MemberCapacityDatabase = db,
): Promise<void> {
  const includePendingInvitations =
    options.includePendingInvitations ?? false;

  const excludedEmail = options.excludeInvitationEmail ?? null;
  const [plan, usage] = await Promise.all([
    getOrganizationPlan(organizationId, database),
    database.execute(sql`SELECT
      (SELECT count(*) FROM members WHERE organization_id = ${organizationId}) AS members,
      (SELECT count(*) FROM invitations i
        WHERE i.organization_id = ${organizationId}
          AND ${includePendingInvitations}
          AND i.status IN ('pending', 'accepted') AND i.expires_at > ${new Date().toISOString()}::timestamp
          AND (${excludedEmail}::text IS NULL OR lower(i.email) <> lower(${excludedEmail}::text))
          AND NOT EXISTS (
            SELECT 1 FROM members m JOIN users u ON u.id = m.user_id
            WHERE m.organization_id = i.organization_id AND lower(u.email) = lower(i.email)
          )) AS invitations`),
  ]);

  // Better Auth marks an invitation accepted before inserting its member.
  // Keep that short-lived reservation until the member exists (or the original
  // invitation expires), so another request cannot claim the same seat.
  const memberCount = Number(usage.rows[0]?.members ?? 0);
  const pendingInvitationCount = Number(usage.rows[0]?.invitations ?? 0);
  const seatsInUse = memberCount + pendingInvitationCount;

  if (!hasAvailableMemberSeat(plan, seatsInUse)) {
    throw new APIError("FORBIDDEN", {
      message: getMemberLimitMessage(plan),
    });
  }
}
