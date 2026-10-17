import { createFileRoute } from "@tanstack/react-router";
import { AdminProductUsagePage } from "@/components/admin/admin-product-usage";

export const Route = createFileRoute("/admin/usage")({
  head: () => ({ meta: [{ title: "Product usage - OutRay" }] }),
  component: AdminProductUsagePage,
});
