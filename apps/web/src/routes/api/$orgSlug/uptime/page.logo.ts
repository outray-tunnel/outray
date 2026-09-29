import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { uptimeStatusPages } from "@/db/uptime-schema";
import { badInput, notFound, requireUptimeManager } from "@/lib/uptime/api";

const MAX_LOGO_BYTES = 256 * 1024;

export const Route = createFileRoute("/api/$orgSlug/uptime/page/logo")({
  server: { handlers: {
    POST: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      let logo: FormDataEntryValue | null;
      try { logo = (await request.formData()).get("logo"); }
      catch { return badInput("Upload a PNG or WebP logo", "logo"); }
      if (!(logo instanceof File) || logo.size <= 0 || logo.size > MAX_LOGO_BYTES) {
        return badInput("Logo must be a PNG or WebP under 256 KiB", "logo");
      }
      const bytes = Buffer.from(await logo.arrayBuffer());
      const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const webp = bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
      if (!png && !webp) return badInput("Only genuine PNG and WebP images are accepted", "logo");
      const data = `data:image/${png ? "png" : "webp"};base64,${bytes.toString("base64")}`;
      const [page] = await db.update(uptimeStatusPages).set({ logoUrl: data, updatedAt: new Date() })
        .where(eq(uptimeStatusPages.organizationId, access.organization.id))
        .returning({ id: uptimeStatusPages.id, logoUrl: uptimeStatusPages.logoUrl });
      if (!page) return notFound("Status page");
      return Response.json({ logoUrl: page.logoUrl });
    },
    DELETE: async ({ request, params }) => {
      const access = await requireUptimeManager(request, params.orgSlug);
      if ("error" in access) return access.error;
      const [page] = await db.update(uptimeStatusPages).set({ logoUrl: null, updatedAt: new Date() })
        .where(eq(uptimeStatusPages.organizationId, access.organization.id))
        .returning({ id: uptimeStatusPages.id });
      if (!page) return notFound("Status page");
      return Response.json({ success: true });
    },
  } },
});
