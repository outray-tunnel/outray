import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const MACHINE_TOKEN_SCOPES = [
  "tunnel:connect",
  "secrets:read",
  "secrets:write",
  "secrets:delete",
] as const;

export type MachineTokenScope = (typeof MACHINE_TOKEN_SCOPES)[number];

const MACHINE_TOKEN_PREFIX_LENGTH = 15;

export function createMachineToken() {
  const token = `outray_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashMachineToken(token),
    prefix: machineTokenPrefix(token),
  };
}

export function hashMachineToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function machineTokenPrefix(token: string) {
  return token.slice(0, Math.min(token.length, MACHINE_TOKEN_PREFIX_LENGTH));
}

export function machineTokenHashMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashMachineToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeMachineTokenScopes(
  input: unknown,
): MachineTokenScope[] | null {
  if (!Array.isArray(input)) return null;
  const allowed = new Set<string>(MACHINE_TOKEN_SCOPES);
  const normalized = Array.from(
    new Set(input.filter((value): value is string => typeof value === "string")),
  );

  if (
    normalized.length === 0 ||
    normalized.some((scope) => !allowed.has(scope))
  ) {
    return null;
  }

  return normalized as MachineTokenScope[];
}

export function machineTokenExpiry(
  expiresIn: unknown,
  now = new Date(),
): Date | null | undefined {
  const value = expiresIn ?? "90d";
  if (value === "never") return null;

  const days = value === "30d" ? 30 : value === "90d" ? 90 : value === "1y" ? 365 : null;
  if (days === null) return undefined;

  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + days);
  return expiresAt;
}
