import { json } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "../db";
import { members, organizations } from "../db/auth-schema";
import { createOrganizationAccessResolver } from "./org-access";

export type AuthOrganization = Awaited<
  ReturnType<typeof auth.api.listOrganizations>
>[number];

export type OrgContextResult =
  | {
      session: Awaited<ReturnType<typeof auth.api.getSession>>;
      organization: AuthOrganization;
    }
  | { error: Response };

const resolveOrganizationAccess = createOrganizationAccessResolver({
  getSession: (request) => auth.api.getSession({ headers: request.headers }),
  findOrganization: async (userId, slug) => {
    // Resolve only the requested membership instead of re-authenticating and
    // loading every organization the user belongs to.
    const [result] = await db
      .select({ organization: organizations })
      .from(members)
      .innerJoin(organizations, eq(members.organizationId, organizations.id))
      .where(and(eq(members.userId, userId), eq(organizations.slug, slug)))
      .limit(1);
    return result?.organization;
  },
});

/**
 * Resolves the organization from the slug in the URL and ensures the caller has access.
 * Returns a Response when unauthenticated/unauthorized so handlers can early-return.
 */
export async function requireOrgFromSlug(
  request: Request,
  orgSlug: string,
): Promise<OrgContextResult> {
  const result = await resolveOrganizationAccess(request, orgSlug);
  if ("status" in result) {
    return {
      error: json({ error: "Unauthorized" }, { status: result.status }),
    };
  }
  return result;
}
