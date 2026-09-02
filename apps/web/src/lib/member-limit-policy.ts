import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from "./subscription-plans";

export const BETTER_AUTH_MEMBERSHIP_CEILING =
  SUBSCRIPTION_PLANS.unlimited.features.maxMembers;

export function resolveSubscriptionPlan(
  plan: string | null | undefined,
): SubscriptionPlan {
  if (
    plan &&
    Object.prototype.hasOwnProperty.call(SUBSCRIPTION_PLANS, plan)
  ) {
    return plan as SubscriptionPlan;
  }

  return "free";
}

export function getMemberLimitForPlan(
  plan: string | null | undefined,
): number {
  return SUBSCRIPTION_PLANS[resolveSubscriptionPlan(plan)].features.maxMembers;
}

export function hasAvailableMemberSeat(
  plan: string | null | undefined,
  seatsInUse: number,
): boolean {
  const limit = getMemberLimitForPlan(plan);
  return limit === -1 || seatsInUse < limit;
}

export function getMemberLimitMessage(
  plan: string | null | undefined,
): string {
  const resolvedPlan = resolveSubscriptionPlan(plan);
  const limit = getMemberLimitForPlan(resolvedPlan);
  const memberLabel = limit === 1 ? "member" : "members";

  return `Member limit reached. The ${resolvedPlan} plan allows ${limit} ${memberLabel}.`;
}
