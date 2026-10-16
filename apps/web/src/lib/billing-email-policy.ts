import type { ProductEmailEvent } from "../../../../shared/product-email";

export interface BillingSubscriptionState {
  plan: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | string | null;
}

export function billingPeriodKey(value: Date | string | null): string {
  return value == null ? "no-period" : new Date(value).toISOString();
}

/** Prefer the SDK-validated provider revision. Older payloads without one use
 * the locked row's revision and resulting state, not the delivery time. */
export function billingTransitionRevision(
  providerModifiedAt: unknown,
  previousUpdatedAt: Date | string | null | undefined,
  next: BillingSubscriptionState,
): string {
  if (providerModifiedAt instanceof Date && Number.isFinite(providerModifiedAt.getTime())) {
    return `provider:${providerModifiedAt.toISOString()}`;
  }
  return `stored:${billingPeriodKey(previousUpdatedAt ?? null)}:${next.plan}:${next.status}:${next.cancelAtPeriodEnd}:${billingPeriodKey(next.currentPeriodEnd)}`;
}

/** Preserve a distinct persisted revision even for back-to-back writes within
 * one clock tick. Call only after locking the subscription row. */
export function nextBillingUpdatedAt(previousUpdatedAt?: Date | null): Date {
  return new Date(Math.max(Date.now(), (previousUpdatedAt?.getTime() ?? 0) + 1));
}

/** Only real account transitions produce mail, not every provider callback. */
export function subscriptionChangeEvents(
  previous: BillingSubscriptionState | null,
  next: BillingSubscriptionState,
  endedAt: Date | string | null = null,
): ProductEmailEvent[] {
  const wasPaid = previous != null && previous.plan !== "free";
  const isPaid = next.plan !== "free";
  const events: ProductEmailEvent[] = [];
  if (wasPaid && !isPaid) {
    return [{
      kind: "subscription-change",
      change: "ended",
      plan: previous.plan,
      effectiveAt: endedAt == null ? null : billingPeriodKey(endedAt),
    }];
  }
  if (!isPaid) return events;
  if ((!wasPaid || previous.status === "incomplete" || previous.status === "incomplete_expired") &&
      ["active", "trialing"].includes(next.status)) {
    events.push({ kind: "subscription-change", change: "activated", plan: next.plan, effectiveAt: null });
  } else if (wasPaid && previous.plan !== next.plan) {
    events.push({ kind: "subscription-change", change: "plan-changed", plan: next.plan, previousPlan: previous.plan, effectiveAt: null });
  }
  if (next.cancelAtPeriodEnd && !previous?.cancelAtPeriodEnd) {
    events.push({ kind: "subscription-change", change: "cancellation-scheduled", plan: next.plan, effectiveAt: next.currentPeriodEnd == null ? null : billingPeriodKey(next.currentPeriodEnd) });
  } else if (previous?.cancelAtPeriodEnd && !next.cancelAtPeriodEnd) {
    events.push({ kind: "subscription-change", change: "cancellation-reversed", plan: next.plan, effectiveAt: null });
  }
  return events;
}
