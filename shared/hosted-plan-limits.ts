/** Host-neutral entitlement definitions. Monthly byte allowances reset in UTC,
 * independently of whether the subscription is billed monthly or annually. */
const GiB = 1024 ** 3;
export const HOSTED_PLAN_LIMITS = {
  free: {
    maxTunnels: 2, maxDomains: 0, maxSubdomains: 1, maxMembers: 1,
    bandwidthPerMonth: 2 * GiB, telemetryBytesPerMonth: GiB, retentionDays: 3,
    maxObservabilityAlerts: 3, maxUptimeMonitors: 5,
    maxSecretVaults: 1, maxSecretEnvironments: 3, maxSecretEntries: 100,
    maxStatusPages: 1, statusAnalytics: false, statusCustomDomains: true, customDomains: false, prioritySupport: false,
  },
  ray: {
    maxTunnels: 3, maxDomains: 1, maxSubdomains: 5, maxMembers: 3,
    bandwidthPerMonth: 25 * GiB, telemetryBytesPerMonth: 5 * GiB, retentionDays: 14,
    maxObservabilityAlerts: 10, maxUptimeMonitors: 10,
    maxSecretVaults: 3, maxSecretEnvironments: 5, maxSecretEntries: 1_000,
    maxStatusPages: 2, statusAnalytics: true, statusCustomDomains: true, customDomains: true, prioritySupport: false,
  },
  beam: {
    maxTunnels: 5, maxDomains: 5, maxSubdomains: 20, maxMembers: 5,
    bandwidthPerMonth: 100 * GiB, telemetryBytesPerMonth: 20 * GiB, retentionDays: 30,
    maxObservabilityAlerts: 30, maxUptimeMonitors: 25,
    maxSecretVaults: 10, maxSecretEnvironments: 10, maxSecretEntries: 5_000,
    maxStatusPages: 5, statusAnalytics: true, statusCustomDomains: true, customDomains: true, prioritySupport: true,
  },
  pulse: {
    maxTunnels: 20, maxDomains: 25, maxSubdomains: 200, maxMembers: 25,
    bandwidthPerMonth: 1024 * GiB, telemetryBytesPerMonth: 100 * GiB, retentionDays: 90,
    maxObservabilityAlerts: 100, maxUptimeMonitors: 100,
    maxSecretVaults: 50, maxSecretEnvironments: 20, maxSecretEntries: 25_000,
    maxStatusPages: 20, statusAnalytics: true, statusCustomDomains: true, customDomains: true, prioritySupport: true,
  },
  unlimited: {
    maxTunnels: 999_999_999, maxDomains: 999_999_999, maxSubdomains: 999_999_999, maxMembers: 999_999_999,
    bandwidthPerMonth: 1024 ** 5, telemetryBytesPerMonth: -1, retentionDays: 32_767,
    maxObservabilityAlerts: 999_999_999, maxUptimeMonitors: 999_999_999,
    maxSecretVaults: 999_999_999, maxSecretEnvironments: 999_999_999, maxSecretEntries: 999_999_999,
    maxStatusPages: 999_999_999, statusAnalytics: true, statusCustomDomains: true, customDomains: true, prioritySupport: true,
  },
} as const;

export type HostedPlan = keyof typeof HOSTED_PLAN_LIMITS;
export function resolveHostedPlan(plan: string | null | undefined): HostedPlan {
  return plan && Object.hasOwn(HOSTED_PLAN_LIMITS, plan) ? plan as HostedPlan : "free";
}

export default { HOSTED_PLAN_LIMITS, resolveHostedPlan };
