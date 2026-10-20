import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { members, organizations } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { admin, owner } from "@/lib/permissions";
import {
  deleteNewOrganizationLogo, InvalidOrganizationLogo, readOrganizationLogoUpload,
  storeOrganizationLogo, type StoredOrganizationLogo,
} from "@/lib/organization-logo-storage.server";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "private, no-store" } });
}

/** Match the console's existing cookie-authenticated administration origin rule. */
function trustedOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") return false;
  const origin = request.headers.get("origin");
  const source = origin ?? request.headers.get("referer");
  if (!source) return false;
  try {
    const sourceUrl = new URL(source);
    return /^https?:$/.test(sourceUrl.protocol) && (origin === null || sourceUrl.origin === origin) && sourceUrl.origin === new URL(request.url).origin;
  } catch { return false; }
}

function canUpdateOrganization(role: string | undefined): boolean {
  const roles = { owner, admin };
  return (role?.split(",") ?? []).some((name) => {
    const configured = name === "owner" || name === "admin" ? roles[name] : undefined;
    return configured?.authorize({ organization: ["update"] }).success === true;
  });
}

async function rollbackUnreferencedLogo(logo: StoredOrganizationLogo) {
  try {
    // A failed commit acknowledgement does not prove the write rolled back.
    const references = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.logo, logo.url)).limit(1);
    if (!references.length) await deleteNewOrganizationLogo(logo);
  } catch { console.error("Could not confirm cleanup of a new organization logo; retaining the object"); }
}

class OrganizationLogoWriteDenied extends Error {
  readonly status: 403 | 404;
  constructor(status: 403 | 404) { super("Organization logo update denied"); this.status = status; }
}

export const Route = createFileRoute("/api/$orgSlug/organization/logo")({
  server: { handlers: {
    POST: async ({ request, params }) => {
      if (!trustedOrigin(request)) return json({ error: "This request must come from the OutRay console." }, 403);
      const headers = new Headers(request.headers);
      headers.delete("authorization");
      const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
      if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);
      const [access] = await db.select({ id: organizations.id, role: members.role }).from(members)
        .innerJoin(organizations, eq(members.organizationId, organizations.id))
        .where(and(eq(members.userId, session.user.id), eq(organizations.slug, params.orgSlug))).limit(1);
      if (!access || !canUpdateOrganization(access.role)) return json({ error: "Only organization owners and admins can update its logo" }, 403);

      let uploaded: StoredOrganizationLogo;
      try {
        const image = await readOrganizationLogoUpload(request);
        uploaded = await storeOrganizationLogo(image.bytes, image.contentType);
      } catch (error) {
        if (error instanceof InvalidOrganizationLogo) return json({ error: error.message, field: "logo" }, error.status);
        console.error("Organization logo upload failed");
        return json({ error: "Logo storage is temporarily unavailable" }, 503);
      }
      try {
        const organization = await db.transaction(async (tx) => {
          const [current] = await tx.select({ id: organizations.id }).from(organizations)
            .where(and(eq(organizations.id, access.id), eq(organizations.slug, params.orgSlug))).for("update");
          if (!current) throw new OrganizationLogoWriteDenied(404);
          const [membership] = await tx.select({ role: members.role }).from(members)
            .where(and(eq(members.organizationId, current.id), eq(members.userId, session.user.id))).for("share");
          if (!membership || !canUpdateOrganization(membership.role)) throw new OrganizationLogoWriteDenied(403);
          const [updated] = await tx.update(organizations).set({ logo: uploaded.url })
            .where(eq(organizations.id, current.id)).returning({ logo: organizations.logo });
          if (!updated) throw new OrganizationLogoWriteDenied(404);
          return updated;
        });
        // Existing immutable logos may still be referenced by cached pages.
        return json({ logoUrl: organization.logo });
      } catch (error) {
        await rollbackUnreferencedLogo(uploaded);
        if (error instanceof OrganizationLogoWriteDenied) return json({ error: error.status === 403 ? "Your permission to update this organization changed" : "Organization not found" }, error.status);
        console.error("Organization logo update failed");
        return json({ error: "Could not update the organization logo. Try again." }, 503);
      }
    },
  } },
});
