import {
  SUBSCRIPTION_PLANS,
  calculatePlanCost,
  calculatePlanCostNGN,
  isUnlimitedPlanLimit,
  type BillingInterval,
  type SubscriptionPlan,
} from "@/lib/subscription-plans";

export type BillingCurrency = "USD" | "NGN";
export type PaidBillingPlan = "ray" | "beam" | "pulse";
export interface BillingSubscription {
  plan: string;
  status?: string;
  currentPeriodEnd?: string | Date | null;
  cancelAtPeriodEnd?: boolean;
  paystackEmail?: string | null;
  paymentProvider?: string;
  billingInterval?: string;
}
export interface BillingUsage {
  tunnels?: number;
  domains?: number;
  subdomains?: number;
  members?: number;
}

export function knownBillingPlan(plan: string): SubscriptionPlan | undefined {
  return Object.prototype.hasOwnProperty.call(SUBSCRIPTION_PLANS, plan)
    ? plan as SubscriptionPlan
    : undefined;
}

export function formatBillingPrice(plan: SubscriptionPlan, interval: BillingInterval, currency: BillingCurrency) {
  const amount = currency === "NGN" ? calculatePlanCostNGN(plan, interval) : calculatePlanCost(plan, interval);
  return `${currency === "NGN" ? "₦" : "$"}${amount.toLocaleString("en-US")}`;
}

export function formatBillingDate(value?: string | Date | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function billingUsageSummary(value: number | undefined, limit: number | undefined, plan: string) {
  const actual = value === undefined || !Number.isFinite(value) ? undefined : Math.max(0, value);
  const unlimited = limit !== undefined && isUnlimitedPlanLimit(plan, limit);
  const percentage = actual === undefined || limit === undefined || unlimited || limit <= 0
    ? undefined
    : Math.min(100, actual / limit * 100);
  return { actual, unlimited, percentage };
}
