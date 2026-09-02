import { APIError } from "better-auth/api";
import { and, count, eq, gt } from "drizzle-orm";

import { db } from "../db";
import { invitations, members } from "../db/auth-schema";
import { subscriptions } from "../db/subscription-schema";
import {
  BETTER_AUTH_MEMBERSHIP_CEILING,
  getMemberLimitForPlan,
  getMemberLimitMessage,
  hasAvailableMemberSeat,
  resolveSubscriptionPlan,
} from "./member-limit-policy";

type MemberCapacityOptions = {
  includePendingInvitations?: boolean;
};

export async function getOrganizationMemberLimit(
  organizationId: string,
): Promise<number> {
  const [subscription] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  return getMemberLimitForPlan(subscription?.plan);
}

export async function getBetterAuthInvitationLimit(
  organizationId: string,
): Promise<number> {
  const limit = await getOrganizationMemberLimit(organizationId);
  return limit === -1 ? BETTER_AUTH_MEMBERSHIP_CEILING : limit;
}

export async function assertOrganizationMemberCapacity(
  organizationId: string,
  options: MemberCapacityOptions = {},
): Promise<void> {
  const includePendingInvitations =
    options.includePendingInvitations ?? false;

  const [subscriptionRows, memberRows, invitationRows] = await Promise.all([
    db
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1),
    db
      .select({ value: count() })
      .from(members)
      .where(eq(members.organizationId, organizationId)),
    includePendingInvitations
      ? db
          .select({ value: count() })
          .from(invitations)
          .where(
            and(
              eq(invitations.organizationId, organizationId),
              eq(invitations.status, "pending"),
              gt(invitations.expiresAt, new Date()),
            ),
          )
      : Promise.resolve([{ value: 0 }]),
  ]);

  const plan = resolveSubscriptionPlan(subscriptionRows[0]?.plan);
  const memberCount = Number(memberRows[0]?.value ?? 0);
  const pendingInvitationCount = Number(invitationRows[0]?.value ?? 0);
  const seatsInUse = memberCount + pendingInvitationCount;

  if (!hasAvailableMemberSeat(plan, seatsInUse)) {
    throw new APIError("FORBIDDEN", {
      message: getMemberLimitMessage(plan),
    });
  }
}
