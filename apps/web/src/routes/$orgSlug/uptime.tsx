import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgSlug/uptime")({
  component: () => <Outlet />,
});
