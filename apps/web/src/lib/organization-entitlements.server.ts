import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "../db/auth-schema";
import { subscriptions } from "../db/subscription-schema";
import { getPlanLimits, installationPlan } from "./subscription-plans";

export type EntitlementsDatabase = Pick<typeof db, "select">;

/** Resolve the authenticated organization's plan, never a client-supplied plan. */
export async function getOrganizationPlan(organizationId: string, database: EntitlementsDatabase = db) {
  const [subscription] = await database.select({ plan: subscriptions.plan })
    .from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1);
  return installationPlan(subscription?.plan);
}

export async function getOrganizationLimits(organizationId: string, database: EntitlementsDatabase = db) {
  return getPlanLimits(await getOrganizationPlan(organizationId, database));
}

/** Acquire before counting or modifying a limited resource, inside the same
 * transaction. Even free organizations have a row, so empty counts cannot race. */
export async function withOrganizationQuotaLock(database: EntitlementsDatabase, organizationId: string) {
  const [organization] = await database.select({ id: organizations.id })
    .from(organizations).where(eq(organizations.id, organizationId)).for("update");
  if (!organization) throw new Error("Organization not found");
}
