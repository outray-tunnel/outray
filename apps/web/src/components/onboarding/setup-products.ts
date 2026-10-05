export type SetupProduct = "tunnels" | "observability" | "secrets" | "uptime";

export function parseSetupProduct(value: unknown): SetupProduct {
  return value === "observability" || value === "secrets" || value === "uptime"
    ? value
    : "tunnels";
}
