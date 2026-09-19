// Subscription plan definitions for Polar and Paystack
export const SUBSCRIPTION_PLANS = {
  free: {
    name: "Free",
    price: 0,
    priceYearly: 0,
    priceNGN: 0,
    priceNGNYearly: 0,
    features: {
      maxTunnels: 2,
      maxDomains: 0,
      maxSubdomains: 1,
      maxMembers: 1,
      bandwidthPerMonth: 1024 * 1024 * 1024 * 2, // 2GB
      retentionDays: 3,
      customDomains: false,
      prioritySupport: false,
    },
  },
  ray: {
    name: "Ray",
    price: 7,
    priceYearly: 70, // 2 months free ($7 × 10)
    priceNGN: 10000, // ₦10,000
    priceNGNYearly: 100000, // ₦100,000 (2 months free)
    polarProductId: process.env.POLAR_RAY_PRODUCT_ID,
    features: {
      maxTunnels: 3,
      maxDomains: 1,
      maxSubdomains: 5,
      maxMembers: 3,
      bandwidthPerMonth: 1024 * 1024 * 1024 * 25, // 25GB
      retentionDays: 14,
      customDomains: true,
      prioritySupport: false,
    },
  },
  beam: {
    name: "Beam",
    price: 15,
    priceYearly: 150, // 2 months free ($15 × 10)
    priceNGN: 21000, // ₦21,000
    priceNGNYearly: 210000, // ₦210,000 (2 months free)
    polarProductId: process.env.POLAR_BEAM_PRODUCT_ID,
    features: {
      maxTunnels: 5,
      maxDomains: 5,
      maxSubdomains: 20,
      maxMembers: 5,
      bandwidthPerMonth: 1024 * 1024 * 1024 * 100, // 100GB
      retentionDays: 30,
      customDomains: true,
      prioritySupport: true,
    },
  },
  pulse: {
    name: "Pulse",
    price: 120,
    priceYearly: 1200, // 2 months free ($120 × 10)
    priceNGN: 170000, // ₦170,000
    priceNGNYearly: 1700000, // ₦1,700,000 (2 months free)
    polarProductId: process.env.POLAR_PULSE_PRODUCT_ID,
    features: {
      maxTunnels: 20,
      maxDomains: 25,
      maxSubdomains: 200,
      maxMembers: -1, // Unlimited
      bandwidthPerMonth: 1024 * 1024 * 1024 * 1024, // 1TB
      retentionDays: 90,
      customDomains: true,
      prioritySupport: true,
    },
  },
  // Internal plan - not shown in UI, manually assigned via database
  unlimited: {
    name: "Unlimited",
    price: 0,
    priceYearly: 0,
    priceNGN: 0,
    priceNGNYearly: 0,
    hidden: true,
    features: {
      maxTunnels: 999999999,
      maxDomains: 999999999,
      maxSubdomains: 999999999,
      maxMembers: 999999999,
      bandwidthPerMonth: 1024 * 1024 * 1024 * 1024 * 1024, // 1PB
      retentionDays: 999999999,
      customDomains: true,
      prioritySupport: true,
    },
  },
} as const;

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PLANS;
export type BillingInterval = "month" | "year";

export function calculatePlanCost(
  plan: SubscriptionPlan,
  interval: BillingInterval = "month",
): number {
  const planConfig = SUBSCRIPTION_PLANS[plan];
  return interval === "year" ? planConfig.priceYearly : planConfig.price;
}

export function calculatePlanCostNGN(
  plan: SubscriptionPlan,
  interval: BillingInterval = "month",
): number {
  const planConfig = SUBSCRIPTION_PLANS[plan];
  return interval === "year" ? planConfig.priceNGNYearly : planConfig.priceNGN;
}

export function canUseFeature(
  plan: SubscriptionPlan,
  feature: keyof typeof SUBSCRIPTION_PLANS.free.features,
  currentUsage?: number,
): boolean {
  const planFeatures = SUBSCRIPTION_PLANS[plan].features;
  // @ts-ignore
  const limit = planFeatures[feature];

  if (limit === -1) return true; // Unlimited

  if (typeof limit === "number" && currentUsage !== undefined) {
    return currentUsage < limit;
  }

  return !!limit;
}

export function getPlanLimits(plan: SubscriptionPlan) {
  return SUBSCRIPTION_PLANS[plan].features;
}

export function getYearlySavingsPercent(): number {
  return 17; // ~2 months free (10/12 = 83%, so 17% savings)
}
