// Subscription plan definitions for Polar and Paystack
export const SUBSCRIPTION_PLANS = {
  free: {
    name: "Free",
    price: 0,
    priceNGN: 0,
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
    priceNGN: 10000, // ₦10,000
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
    priceNGN: 21000, // ₦21,000
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
    priceNGN: 170000, // ₦170,000
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
    priceNGN: 0,
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

export function calculatePlanCost(plan: SubscriptionPlan): number {
  return SUBSCRIPTION_PLANS[plan].price;
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
