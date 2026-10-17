import { createFileRoute } from "@tanstack/react-router";
import { AdminProductPage } from "@/components/admin/admin-product-page";
import { adminProductSearch } from "@/lib/admin-products";

export const Route = createFileRoute("/admin/secrets")({
  head: () => ({ meta: [{ title: "Admin Secrets - OutRay" }] }),
  validateSearch: (search) => adminProductSearch("secrets", search),
  component: SecretsPage,
});

function SecretsPage() {
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  return <AdminProductPage product="secrets" params={params} onParamsChange={(search) => void navigate({ search, replace: true })} />;
}
