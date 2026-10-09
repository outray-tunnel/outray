import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgSlug/tunnel")({
  component: TunnelLayout,
});

function TunnelLayout() {
  return <Outlet />;
}
