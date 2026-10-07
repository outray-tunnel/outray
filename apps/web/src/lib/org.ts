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

export type OrgMembershipContextResult =
  | {
      session: Awaited<ReturnType<typeof auth.api.getSession>>;
      organization: AuthOrganization;
      membership: { role: string };
    }
  | { error: Response };

const resolveOrganizationAccess = createOrganizationAccessResolver({
  getSession: (request) => auth.api.getSession({ headers: request.headers }),
  findOrganization: async (userId, slug) => {
    // Resolve only the requested membership instead of re-authenticating and
    // loading every organization the user belongs to.
    const [result] = await db
      .select({ organization: organizations, membership: { role: members.role } })
      .from(members)
      .innerJoin(organizations, eq(members.organizationId, organizations.id))
      .where(and(eq(members.userId, userId), eq(organizations.slug, slug)))
      .limit(1);
    return result;
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
  const result = await requireOrgMembershipFromSlug(request, orgSlug);
  if ("error" in result) return result;
  // Keep the organization-only contract unchanged for existing consumers.
  return { session: result.session, organization: result.organization };
}

/** Read the role from the same membership check, without a second database read. */
export async function requireOrgMembershipFromSlug(
  request: Request,
  orgSlug: string,
): Promise<OrgMembershipContextResult> {
  const result = await resolveOrganizationAccess(request, orgSlug);
  if ("status" in result) {
    return {
      error: json({ error: "Unauthorized" }, { status: result.status }),
    };
  }
  return {
    session: result.session,
    organization: result.organization.organization,
    membership: result.organization.membership,
  };
}
