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
  reservedMemberSeats?: number;
  uptimeMonitors?: number;
  observabilityAlerts?: number;
  secretVaults?: number;
  secretEntries?: number;
  statusPages?: number;
  bandwidthBytes?: number;
  telemetryBytes?: number;
  telemetryMonth?: string;
  telemetryResetsAt?: string;
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

export function formatBillingBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = bytes > 0 ? Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024))) : 0;
  return `${(bytes / 1024 ** index).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${units[index]}`;
}
