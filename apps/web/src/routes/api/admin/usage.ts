import { createFileRoute } from "@tanstack/react-router";
import { adminJson, requireAdminAccess } from "../../../lib/admin-access.server";
import { AdminUsageInputError, loadAdminUsage, parseAdminUsageParams } from "../../../lib/admin-usage.server";
import { cachedDashboardRead } from "../../../lib/dashboard-cache";

export const Route = createFileRoute("/api/admin/usage")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await requireAdminAccess(request);
        if (denied) return denied;

        try {
          const params = parseAdminUsageParams(new URL(request.url).searchParams);
          const key = `admin:usage:v1:${new Date().toISOString().slice(0, 10)}:${JSON.stringify(params)}`;
          const report = await cachedDashboardRead(key, () => loadAdminUsage(params));
          return adminJson(report);
        } catch (error) {
          if (error instanceof AdminUsageInputError) return adminJson({ error: error.message }, { status: 400 });
          console.error("Admin usage report failed", error instanceof Error ? error.name : "Unknown error");
          return adminJson({ error: "Product usage is temporarily unavailable." }, { status: 500 });
        }
      },
    },
  },
});
