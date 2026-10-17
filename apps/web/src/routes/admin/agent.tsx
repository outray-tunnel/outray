import { createFileRoute } from "@tanstack/react-router";
import { AdminProductPage } from "@/components/admin/admin-product-page";
import { adminProductSearch } from "@/lib/admin-products";

export const Route = createFileRoute("/admin/agent")({
  head: () => ({ meta: [{ title: "Admin Agent - OutRay" }] }),
  validateSearch: (search) => adminProductSearch("agent", search),
  component: AgentPage,
});

function AgentPage() {
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  return <AdminProductPage product="agent" params={params} onParamsChange={(search) => void navigate({ search, replace: true })} />;
}
