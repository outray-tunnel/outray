import { createFileRoute } from "@tanstack/react-router";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { uptimeStatusGroups, uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, findStatusPage, jsonBody, loadPage, notFound, requireUptimeManager, requireUptimeRead } from "@/lib/uptime/api";
import { safeUptimeSlug, textField } from "@/lib/uptime/validation";
import { isAlertManagerRole } from "@/lib/observability/alert-validation";
import { getOrganizationLimits, withOrganizationQuotaLock } from "@/lib/organization-entitlements.server";
import {
  ensureCanonicalStatusHostname,
  statusDomainProviderResponse,
} from "@/lib/uptime/status-domain-provider.server";

export const Route = createFileRoute("/api/$orgSlug/uptime/page")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const access = await requireUptimeRead(request, params.orgSlug);
        if ("error" in access) return access.error;
        const [data, pages, limits] = await Promise.all([
          loadPage(access.organization.id, request),
          db.select({ id: uptimeStatusPages.id, name: uptimeStatusPages.name,
            slug: uptimeStatusPages.slug, published: uptimeStatusPages.published,
            createdAt: uptimeStatusPages.createdAt }).from(uptimeStatusPages)
            .where(eq(uptimeStatusPages.organizationId, access.organization.id))
            .orderBy(asc(uptimeStatusPages.createdAt), asc(uptimeStatusPages.id)),
          getOrganizationLimits(access.organization.id),
        ]);
        return Response.json({ ...(data ?? { page: null, groups: [], standaloneComponents: [] }),
          pages, limit: limits.maxStatusPages, analyticsAvailable: limits.statusAnalytics, canManage: isAlertManagerRole(access.membership.role) });
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
            await withOrganizationQuotaLock(tx, access.organization.id);
            const { maxStatusPages: limit } = await getOrganizationLimits(access.organization.id, tx);
            const [existing] = await tx.select({ count: sql<number>`count(*)::int` }).from(uptimeStatusPages)
              .where(eq(uptimeStatusPages.organizationId, access.organization.id));
            if (existing.count >= limit) return { limitReached: true, limit } as const;
            const [page] = await tx.insert(uptimeStatusPages).values({
              id: crypto.randomUUID(), organizationId: access.organization.id,
              slug, name: name!, description,
            }).returning();
            const [group] = await tx.insert(uptimeStatusGroups).values({
              id: crypto.randomUUID(), organizationId: access.organization.id,
              pageId: page.id, name: "Services", sortOrder: 0,
            }).returning();
            return { page, group } as const;
          });
          if ("limitReached" in result) return Response.json({ error: `Status page limit reached: ${result.limit} ${result.limit === 1 ? "page" : "pages"} per organization`, limit: result.limit }, { status: 403 });
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

        if (body.published === true) {
          const current = await findStatusPage(access.organization.id, request);
          if (!current) return notFound("Status page");

          let provisioning;
          try {
            provisioning = await ensureCanonicalStatusHostname({
              slug: current.slug,
              pageId: current.id,
              providerId: current.providerId,
              persistProviderResource: async (resource) => {
                await db.update(uptimeStatusPages).set({
                  providerId: resource.providerId,
                  providerStatus: resource.providerStatus,
                  updatedAt: new Date(),
                }).where(eq(uptimeStatusPages.id, current.id));
              },
            });
          } catch (error) {
            return statusDomainProviderResponse(error);
          }

          if (provisioning) {
            update.providerId = provisioning.providerId;
            update.providerStatus = provisioning.providerStatus;
            if (!provisioning.ready) {
              // Apply any harmless settings in the same request but never make
              // a page public until both hostname and certificate are active.
              update.published = current.published;
              const [pendingPage] = await db.update(uptimeStatusPages).set(update)
                .where(eq(uptimeStatusPages.id, current.id)).returning();
              if (provisioning.failed) {
                return Response.json({ error: "Status page address provisioning failed" }, { status: 503 });
              }
              return Response.json({
                page: pendingPage,
                provisioning: true,
                hostname: provisioning.hostname,
              }, { status: 202 });
            }
          }
        }
        const selected = await findStatusPage(access.organization.id, request);
        if (!selected) return notFound("Status page");
        const [page] = await db.update(uptimeStatusPages).set(update)
          .where(eq(uptimeStatusPages.id, selected.id)).returning();
        if (!page) return notFound("Status page");
        return Response.json({ page });
      },
    },
  },
});
