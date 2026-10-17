import type { AdminProduct, AdminUsageRange } from "./admin-usage";

export const adminProductPaths = {
  tunnels: "/admin/tunnels",
  observability: "/admin/observability",
  secrets: "/admin/secrets",
  uptime: "/admin/uptime",
  agent: "/admin/agent",
} as const;

export const adminProductPages = {
  tunnels: { name: "Tunnels", description: "Connections, custom domains, and reserved addresses across the platform.", views: [{ id: "domains", label: "Custom domains" }, { id: "subdomains", label: "Reserved subdomains" }] },
  observability: { name: "Observability", description: "Telemetry adoption, ingestion volume, and alert health across workspaces.", views: [{ id: "workspaces", label: "Telemetry" }, { id: "alerts", label: "Alerts" }] },
  secrets: { name: "Secrets", description: "Vault adoption, environment coverage, sharing, and access activity.", views: [{ id: "vaults", label: "Vaults" }, { id: "shares", label: "Share links" }, { id: "activity", label: "Activity" }] },
  uptime: { name: "Uptime", description: "Monitor health, public status pages, and incidents across the platform.", views: [{ id: "monitors", label: "Monitors" }, { id: "pages", label: "Status pages" }, { id: "incidents", label: "Incidents" }] },
  agent: { name: "Agent", description: "Run reliability, token consumption, and workspace adoption.", views: [{ id: "runs", label: "Runs" }, { id: "workspaces", label: "Workspaces" }] },
} satisfies Record<AdminProduct, { name: string; description: string; views: { id: string; label: string }[] }>;

export type AdminProductValueFormat = "text" | "number" | "bytes" | "percent" | "date" | "duration" | "status";
export type AdminProductValue = string | number | boolean | null;
export interface AdminProductColumn { key: string; label: string; format?: AdminProductValueFormat }
export interface AdminProductRecord {
  id: string;
  name: string;
  organization: { id: string; name: string; slug: string };
  values: Record<string, AdminProductValue>;
  details?: Array<{ label: string; value: AdminProductValue; format?: AdminProductValueFormat }>;
}
export interface AdminProductMetric {
  key: string;
  label: string;
  value: number | null;
  format?: "number" | "bytes" | "percent" | "duration";
  description: string;
}
export interface AdminProductBreakdown {
  key: string;
  title: string;
  description: string;
  format?: "number" | "bytes";
  items: Array<{ label: string; value: number; tone?: "neutral" | "green" | "amber" | "red" | "purple" | "blue" }>;
}
export interface AdminProductResponse {
  product: AdminProduct;
  generatedAt: string;
  period: { range: AdminUsageRange; from: string; to: string };
  metrics: AdminProductMetric[];
  breakdowns: AdminProductBreakdown[];
  trend: { title: string; description: string; interval: "day" | "month"; series: Array<{ key: string; label: string; format?: "number" | "bytes" }>; points: Array<{ date: string; values: Record<string, number> }> };
  resources: {
    view: string;
    description: string;
    nameLabel: string;
    columns: AdminProductColumn[];
    rows: AdminProductRecord[];
    statusOptions: Array<{ value: string; label: string }>;
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  };
  notes: string[];
}
export interface AdminProductParams {
  view?: string;
  range?: AdminUsageRange;
  page?: number;
  search?: string;
  status?: string;
}

/** Shared URL state for product tabs, period, filtering, and pagination. */
export function adminProductSearch(product: AdminProduct, search: Record<string, unknown>): AdminProductParams {
  const views = adminProductPages[product].views;
  const view = typeof search.view === "string" && views.some((item) => item.id === search.view) ? search.view : views[0].id;
  const range = search.range === "7d" || search.range === "90d" ? search.range : "30d";
  const page = Number(search.page);
  return {
    view, range, page: Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1,
    search: typeof search.search === "string" ? search.search.slice(0, 150) : "",
    status: typeof search.status === "string" ? search.status.slice(0, 40) : "",
  };
}
