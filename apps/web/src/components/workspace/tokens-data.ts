import { formatDistance } from "date-fns";
import type { AuthToken } from "@/lib/app-client";

export type TokenStatus = "active" | "expired" | "revoked";
export type TokenStatusFilter = "all" | TokenStatus;
export type TokenBoundary = "organization" | "project" | "environment";
export type TokenExpiry = "30d" | "90d" | "1y" | "never";
export type TokenScope = AuthToken["scopes"][number];

export const tokenPermissionOptions: Array<{ value: TokenScope; product: string; label: string; description: string }> = [
  { value: "tunnel:connect", product: "Tunnels", label: "Connect tunnels", description: "Authenticate tunnel clients in this workspace." },
  { value: "observability:write", product: "Observability", label: "Send telemetry", description: "Ingest traces, logs, and metrics." },
  { value: "secrets:read", product: "Secrets", label: "Read", description: "List, reveal, export, pull, and inject values." },
  { value: "secrets:write", product: "Secrets", label: "Write", description: "Create, update, import, and roll back values." },
  { value: "secrets:delete", product: "Secrets", label: "Delete", description: "Delete individual secrets." },
];

export function tokenDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function tokenStatus(token: AuthToken, now = Date.now()): TokenStatus {
  if (token.revokedAt) return "revoked";
  const expiry = tokenDate(token.expiresAt);
  return expiry && expiry.getTime() <= now ? "expired" : "active";
}

/** List metadata is never a place to show a full credential, even if a prefix is malformed. */
export function maskedTokenPrefix(prefix: string): string {
  return `${prefix.slice(0, 15)}••••••••`;
}

export function tokenScopeGroups(scopes: AuthToken["scopes"]) {
  const groups: Array<{ product: string; permissions: string }> = [];
  if (scopes.includes("tunnel:connect")) groups.push({ product: "Tunnels", permissions: "Connect" });
  if (scopes.includes("observability:write")) groups.push({ product: "Observability", permissions: "Ingest" });
  const secrets = tokenPermissionOptions.filter((option) => option.product === "Secrets" && scopes.includes(option.value));
  if (secrets.length) groups.push({ product: "Secrets", permissions: secrets.map((option) => option.label.toLowerCase()).join(", ") });
  return groups;
}

export function tokenResourceLabel(token: AuthToken): string {
  return token.environmentId ? "One environment" : token.projectId ? "One vault" : "Workspace-wide";
}

export function filterTokens(tokens: readonly AuthToken[], search: string, status: TokenStatusFilter, now = Date.now()): AuthToken[] {
  const query = search.trim().toLowerCase();
  return tokens.filter((token) => {
    const state = tokenStatus(token, now);
    if (status !== "all" && state !== status) return false;
    if (!query) return true;
    return [token.name, token.prefix.slice(0, 15), state, tokenResourceLabel(token), ...token.scopes, ...tokenScopeGroups(token.scopes).map((group) => `${group.product} ${group.permissions}`)]
      .join(" ").toLowerCase().includes(query);
  });
}

export function relativeTokenDate(value: string, now = Date.now()): string {
  const date = tokenDate(value);
  return date ? formatDistance(date, new Date(now), { addSuffix: true }) : "Unknown";
}

export function canCreateToken({ name, scopes, boundary, projectValid, environmentValid }: {
  name: string; scopes: TokenScope[]; boundary: TokenBoundary; projectValid: boolean; environmentValid: boolean;
}): boolean {
  const length = name.trim().length;
  if (length === 0 || length > 100 || scopes.length === 0) return false;
  if (boundary === "organization") return true;
  if (!scopes.some((scope) => scope.startsWith("secrets:")) || !projectValid) return false;
  return boundary === "project" || environmentValid;
}
