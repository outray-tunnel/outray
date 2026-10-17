import { createFileRoute } from "@tanstack/react-router";
import { adminJson, requireAdminAccess } from "../../../lib/admin-access.server";
import { AdminProductInputError, loadAdminProduct, parseAdminProductParams } from "../../../lib/admin-products.server";
import { cachedDashboardRead } from "../../../lib/dashboard-cache";

export const Route = createFileRoute("/api/admin/products/$product")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = await requireAdminAccess(request);
        if (denied) return denied;

        try {
          const validated = parseAdminProductParams(params.product, new URL(request.url).searchParams);
          const key = `admin:product:v1:${new Date().toISOString().slice(0, 10)}:${JSON.stringify(validated)}`;
          const report = await cachedDashboardRead(key, () => loadAdminProduct(validated.product, validated.params));
          return adminJson(report);
        } catch (error) {
          if (error instanceof AdminProductInputError) return adminJson({ error: error.message }, { status: error.message === "Unknown product" ? 404 : 400 });
          console.error("Admin product report failed", error instanceof Error ? error.name : "Unknown error");
          return adminJson({ error: "Product details are temporarily unavailable." }, { status: 500 });
        }
      },
    },
  },
});
