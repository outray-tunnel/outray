import { createFileRoute } from "@tanstack/react-router";
import { AdminTunnelConnectionsPage } from "@/components/admin/admin-tunnel-connections";

export const Route = createFileRoute("/admin/tunnels/connections")({
  head: () => ({ meta: [{ title: "Live connections - OutRay Admin" }] }),
  component: AdminTunnelConnectionsPage,
});
