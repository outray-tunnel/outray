export const adminProducts = ["tunnels", "observability", "secrets", "uptime", "agent"] as const;
export type AdminProduct = typeof adminProducts[number];
export type AdminUsageRange = "7d" | "30d" | "90d";
export type AdminMetricFormat = "number" | "bytes" | "percent";

export interface AdminUsageMetric {
  key: string;
  label: string;
  value: number | null;
  format: AdminMetricFormat;
  window: "current" | "range" | "month";
}

export interface AdminProductUsage {
  id: AdminProduct;
  name: string;
  configuredOrganizations: number;
  activeOrganizations: number | null;
  activityWindow: "range" | "month";
  adoptionDefinition: string;
  activityDefinition: string;
  metrics: AdminUsageMetric[];
}

export interface AdminWorkspaceUsage {
  id: string;
  name: string;
  slug: string;
  plan: string;
  products: AdminProduct[];
  lastActivityAt: string | null;
  tunnels: number;
  alerts: number;
  vaults: number;
  secrets: number;
  monitors: number;
  publishedStatusPages: number;
  telemetryBytesMonth: number;
  secretOperations: number;
  uptimeChecks: number;
  agentRuns: number;
  agentTokens: number;
}

export interface AdminUsageResponse {
  generatedAt: string;
  period: { range: AdminUsageRange; from: string; to: string; month: string };
  summary: {
    organizations: number;
    users: number;
    adoptedOrganizations: number;
    multiProductOrganizations: number;
    productConfigurations: number;
  };
  products: AdminProductUsage[];
  daily: Array<{ date: string; secretOperations: number; uptimeChecks: number; agentRuns: number; agentTokens: number; tunnelsCreated: number }>;
  telemetryMonthly: Array<{ month: string; bytes: number; organizations: number }>;
  organizations: AdminWorkspaceUsage[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  coverage: string[];
}

export interface AdminUsageParams {
  range?: AdminUsageRange;
  page?: number;
  search?: string;
  product?: AdminProduct;
  organizationId?: string;
}

export function formatAdminUsage(value: number | null, format: AdminMetricFormat = "number"): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  if (format === "percent") return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  if (format === "bytes") {
    if (value === 0) return "0 B";
    const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
    const index = Math.max(0, Math.min(Math.floor(Math.log(Math.max(value, 1)) / Math.log(1024)), units.length - 1));
    return `${(value / 1024 ** index).toLocaleString(undefined, { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
  }
  return value.toLocaleString();
}
