import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/auth-schema";
import { uptimeStatusGroups, uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, jsonBody, loadPage, notFound, requireUptimeManager, requireUptimeRead } from "@/lib/uptime/api";
import { safeUptimeSlug, textField } from "@/lib/uptime/validation";
import { isAlertManagerRole } from "@/lib/observability/alert-validation";

export const Route = createFileRoute("/api/$orgSlug/uptime/page")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const access = await requireUptimeRead(request, params.orgSlug);
        if ("error" in access) return access.error;
        const data = await loadPage(access.organization.id);
        return Response.json({ ...(data ?? { page: null, groups: [], standaloneComponents: [] }), canManage: isAlertManagerRole(access.membership.role) });
      },
      POST: async ({ request, params }) => {
        const access = await requireUptimeManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const body = await jsonBody(request);
        if (body instanceof Response) return body;
        const name = textField(body.name ?? access.organization.name, 120, true);
        const description = textField(body.description ?? null, 1_000);
        const slug = safeUptimeSlug(body.slug ?? access.organization.slug ?? params.orgSlug)
          ?? (body.slug === undefined ? safeUptimeSlug(`${params.orgSlug}-status`) : null);
        if (name === undefined) return badInput("Page name must be 1–120 characters", "name");
        if (description === undefined) return badInput("Description is too long", "description");
        if (!slug) return badInput("Slug must be 3–63 lowercase letters, numbers, or hyphens", "slug");
        try {
          const result = await db.transaction(async (tx) => {
            await tx.select({ id: organizations.id }).from(organizations)
              .where(eq(organizations.id, access.organization.id)).for("update");
            const [existing] = await tx.select({ id: uptimeStatusPages.id }).from(uptimeStatusPages)
              .where(eq(uptimeStatusPages.organizationId, access.organization.id)).limit(1);
            if (existing) return false;
            const [page] = await tx.insert(uptimeStatusPages).values({
              id: crypto.randomUUID(), organizationId: access.organization.id,
              slug, name: name!, description,
            }).returning();
            const [group] = await tx.insert(uptimeStatusGroups).values({
              id: crypto.randomUUID(), organizationId: access.organization.id,
              pageId: page.id, name: "Services", sortOrder: 0,
            }).returning();
            return { page, group };
          });
          if (!result) return Response.json({ error: "This organization already has its beta status page" }, { status: 409 });
          return Response.json({ page: result.page, groups: [{ ...result.group, components: [] }], standaloneComponents: [] }, { status: 201 });
        } catch (error) {
          if ((error as { code?: string })?.code === "23505") return Response.json({ error: "Status-page slug is already in use" }, { status: 409 });
          throw error;
        }
      },
      PATCH: async ({ request, params }) => {
        const access = await requireUptimeManager(request, params.orgSlug);
        if ("error" in access) return access.error;
        const body = await jsonBody(request);
        if (body instanceof Response) return body;
        const allowed = new Set(["name", "description", "accentColor", "logoUrl", "published"]);
        if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) {
          return badInput("Provide valid page settings");
        }
        const update: Partial<typeof uptimeStatusPages.$inferInsert> = { updatedAt: new Date() };
        if (Object.hasOwn(body, "name")) {
          const value = textField(body.name, 120, true);
          if (value === undefined) return badInput("Page name must be 1–120 characters", "name");
          update.name = value!;
        }
        if (Object.hasOwn(body, "description")) {
          const value = textField(body.description, 1_000);
          if (value === undefined) return badInput("Description is too long", "description");
          update.description = value;
        }
        if (Object.hasOwn(body, "accentColor")) {
          if (typeof body.accentColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(body.accentColor)) {
            return badInput("Use a six-digit hex color", "accentColor");
          }
          update.accentColor = body.accentColor;
        }
        if (Object.hasOwn(body, "logoUrl")) {
          if (body.logoUrl !== null && (typeof body.logoUrl !== "string" ||
              !/^https:\/\/.+\.(?:png|webp)(?:\?.*)?$/i.test(body.logoUrl) || body.logoUrl.length > 2_048)) {
            return badInput("Logo must be an HTTPS PNG or WebP URL", "logoUrl");
          }
          update.logoUrl = body.logoUrl as string | null;
        }
        if (Object.hasOwn(body, "published")) {
          if (typeof body.published !== "boolean") return badInput("Published must be true or false", "published");
          update.published = body.published;
        }
        const [page] = await db.update(uptimeStatusPages).set(update)
          .where(eq(uptimeStatusPages.organizationId, access.organization.id)).returning();
        if (!page) return notFound("Status page");
        return Response.json({ page });
      },
    },
  },
});
