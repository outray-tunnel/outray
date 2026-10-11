import { SecretsError } from "./types";

export type SecretsQuotaLimits = {
  maxSecretVaults: number;
  maxSecretEnvironments: number;
  maxSecretEntries: number;
};

export type SecretsQuotaResource = keyof SecretsQuotaLimits;

const resourceNames: Record<SecretsQuotaResource, string> = {
  maxSecretVaults: "active vaults per organization",
  maxSecretEnvironments: "active environments per vault",
  maxSecretEntries: "active secret entries per organization",
};

/** Only net growth is gated: a downgrade never prevents updates or deletion. */
export function assertSecretsQuotaGrowth(
  resource: SecretsQuotaResource,
  limit: number,
  current: number,
  added: number,
) {
  if (added <= 0 || limit === -1 || current + added <= limit) return;
  throw new SecretsError(
    `This organization allows ${limit.toLocaleString()} ${resourceNames[resource]}. ` +
      `This operation would use ${(current + added).toLocaleString()}; remove unused items or upgrade your capacity.`,
    {
      code: "PLAN_LIMIT_REACHED",
      status: 403,
      details: { resource, limit, current, added },
    },
  );
}
