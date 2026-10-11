import { and, count, eq, isNull } from "drizzle-orm";
import { secretEntries, secretEnvironments, secretProjects } from "../../db/secrets-schema";
import { getOrganizationLimits } from "../organization-entitlements.server";
import type { SecretsTransaction } from "./database";
import { assertSecretsQuotaGrowth } from "./quota-policy";

type Growth = {
  vaults?: number;
  entries?: number;
  /** A null project ID represents the newly created vault, whose usage is zero. */
  environments?: { projectId: string | null; added: number }[];
};

/** Call after locking the organization, in the transaction doing the mutation.
 * All secret growth paths take that same row lock, so count + write is atomic. */
export async function assertSecretCapacity(
  tx: SecretsTransaction,
  organizationId: string,
  growth: Growth,
) {
  if (!(growth.vaults && growth.vaults > 0) && !(growth.entries && growth.entries > 0) &&
      !growth.environments?.some(({ added }) => added > 0)) return;
  const limits = await getOrganizationLimits(organizationId, tx);
  if (growth.vaults && growth.vaults > 0 && limits.maxSecretVaults !== -1) {
    const [usage] = await tx.select({ count: count() }).from(secretProjects).where(and(
      eq(secretProjects.organizationId, organizationId), isNull(secretProjects.deletedAt),
    ));
    assertSecretsQuotaGrowth("maxSecretVaults", limits.maxSecretVaults, usage.count, growth.vaults);
  }
  for (const { projectId, added } of growth.environments ?? []) {
    if (added <= 0 || limits.maxSecretEnvironments === -1) continue;
    const [usage] = projectId ? await tx.select({ count: count() }).from(secretEnvironments).where(and(
      eq(secretEnvironments.organizationId, organizationId),
      eq(secretEnvironments.projectId, projectId), isNull(secretEnvironments.deletedAt),
    )) : [{ count: 0 }];
    assertSecretsQuotaGrowth("maxSecretEnvironments", limits.maxSecretEnvironments, usage.count, added);
  }
  if (growth.entries && growth.entries > 0 && limits.maxSecretEntries !== -1) {
    const [usage] = await tx.select({ count: count() }).from(secretEntries).where(and(
      eq(secretEntries.organizationId, organizationId), isNull(secretEntries.deletedAt),
    ));
    assertSecretsQuotaGrowth("maxSecretEntries", limits.maxSecretEntries, usage.count, growth.entries);
  }
}
