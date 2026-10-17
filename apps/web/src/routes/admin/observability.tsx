import { createFileRoute } from "@tanstack/react-router";
import { AdminProductPage } from "@/components/admin/admin-product-page";
import { adminProductSearch } from "@/lib/admin-products";

export const Route = createFileRoute("/admin/observability")({
  head: () => ({ meta: [{ title: "Admin Observability - OutRay" }] }),
  validateSearch: (search) => adminProductSearch("observability", search),
  component: ObservabilityPage,
});

function ObservabilityPage() {
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  return <AdminProductPage product="observability" params={params} onParamsChange={(search) => void navigate({ search, replace: true })} />;
}
