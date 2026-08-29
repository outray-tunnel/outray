import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgSlug/observability")({
  component: ObservabilityLayout,
});

function ObservabilityLayout() {
  return <Outlet />;
}
