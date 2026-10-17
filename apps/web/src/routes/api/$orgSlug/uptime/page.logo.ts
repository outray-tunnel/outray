import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, findStatusPage, notFound, requireUptimeManager } from "@/lib/uptime/api";

import {
  deleteNewStatusPageLogo,
  InvalidStatusPageLogo,
  readStatusPageLogoUpload,
  storeStatusPageLogo,
  type StoredStatusPageLogo,
} from "@/lib/uptime/status-logo-storage.server";

async function rollbackUnreferencedLogo(logo: StoredStatusPageLogo) {
  try {
    // A transport error can make the commit outcome uncertain. Do not delete
    // the object unless a primary-database read confirms it is unused.
    const references = await db.select({ id: uptimeStatusPages.id }).from(uptimeStatusPages)
      .where(eq(uptimeStatusPages.logoUrl, logo.url)).limit(1);
    if (!references.length) await deleteNewStatusPageLogo(logo);
  } catch {
    console.error("Could not confirm cleanup of an unreferenced status-page logo; retaining the object");
  }
}

export const Route = createFileRoute("/api/$orgSlug/uptime/page/logo")({
  server: { handlers: {
    POST: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const existing = await findStatusPage(access.organization.id, request);
      if (!existing) return notFound("Status page");

      let uploaded: StoredStatusPageLogo;
      try {
        const logo = await readStatusPageLogoUpload(request);
        uploaded = await storeStatusPageLogo(logo.bytes, logo.contentType);
      } catch (error) {
        if (error instanceof InvalidStatusPageLogo) return badInput(error.message, "logo");
        console.error("Status-page logo upload failed");
        return Response.json({ error: "Logo storage is temporarily unavailable" }, { status: 503 });
      }

      try {
        const [page] = await db.update(uptimeStatusPages).set({ logoUrl: uploaded.url, updatedAt: new Date() })
          .where(and(eq(uptimeStatusPages.id, existing.id), eq(uptimeStatusPages.organizationId, access.organization.id)))
          .returning({ id: uptimeStatusPages.id, logoUrl: uptimeStatusPages.logoUrl });
        if (!page) {
          await rollbackUnreferencedLogo(uploaded);
          return notFound("Status page");
        }
        // Retain previous immutable logos: cached pages or another page with a
        // manually assigned URL may still reference the same object.
        return Response.json({ logoUrl: page.logoUrl });
      } catch (error) {
        await rollbackUnreferencedLogo(uploaded);
        throw error;
      }
    },
    DELETE: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const selected = await findStatusPage(access.organization.id, request);
      if (!selected) return notFound("Status page");
      const [page] = await db.update(uptimeStatusPages).set({ logoUrl: null, updatedAt: new Date() })
        .where(and(eq(uptimeStatusPages.id, selected.id), eq(uptimeStatusPages.organizationId, access.organization.id)))
        .returning({ id: uptimeStatusPages.id });
      if (!page) return notFound("Status page");
      // Unlink the logo from this page without deleting possibly shared URLs.
      return Response.json({ success: true });
    },
  } },
});
