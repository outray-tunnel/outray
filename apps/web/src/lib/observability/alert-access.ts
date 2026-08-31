import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { members, users } from "@/db/auth-schema";
import { requireOrgFromSlug } from "@/lib/org";
import { isAlertManagerRole } from "./alert-validation";

export async function requireAlertManager(request: Request, orgSlug: string) {
  const orgResult = await requireOrgFromSlug(request, orgSlug);
  if ("error" in orgResult) return orgResult;

  const session = orgResult.session;
  if (!session?.user) {
    return {
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const membership = await db.query.members.findFirst({
    columns: { role: true },
    where: and(
      eq(members.organizationId, orgResult.organization.id),
      eq(members.userId, session.user.id),
    ),
  });

  if (!isAlertManagerRole(membership?.role)) {
    return {
      error: Response.json(
        { error: "Only organization owners and admins can manage alerts" },
        { status: 403 },
      ),
    };
  }

  return { ...orgResult, role: membership.role };
}

export async function notificationEmailBelongsToOrganization(
  organizationId: string,
  email: string | null,
) {
  if (!email) return true;

  const rows = await db
    .select({ id: members.id })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(
      and(
        eq(members.organizationId, organizationId),
        sql`lower(${users.email}) = lower(${email})`,
      ),
    )
    .limit(1);

  return rows.length > 0;
}
