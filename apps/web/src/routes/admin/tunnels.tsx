import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { AdminProductPage } from "@/components/admin/admin-product-page";
import { adminProductSearch } from "@/lib/admin-products";

export const Route = createFileRoute("/admin/tunnels")({
  head: () => ({ meta: [{ title: "Admin Tunnels - OutRay" }] }),
  validateSearch: (search) => adminProductSearch("tunnels", search),
  component: TunnelsPage,
});

function TunnelsPage() {
  const params = Route.useSearch();
  const navigate = Route.useNavigate();
  const path = useLocation({ select: (location) => location.pathname });
  if (path.replace(/\/$/, "") !== "/admin/tunnels") return <Outlet />;
  return <AdminProductPage product="tunnels" params={params} onParamsChange={(search) => void navigate({ search, replace: true })} />;
}
