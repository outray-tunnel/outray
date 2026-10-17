import { createFileRoute } from "@tanstack/react-router";
import { AdminProductPage } from "@/components/admin/admin-product-page";
import { adminProductSearch } from "@/lib/admin-products";

export const Route = createFileRoute("/admin/uptime")({
  head: () => ({ meta: [{ title: "Admin Uptime - OutRay" }] }),
  validateSearch: (search) => adminProductSearch("uptime", search),
  component: UptimePage,
});

function UptimePage() {
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  return <AdminProductPage product="uptime" params={params} onParamsChange={(search) => void navigate({ search, replace: true })} />;
}
