import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgSlug/observability/monitors")({
  head: () => ({ meta: [{ title: "Alerts - OutRay Observability" }] }),
  component: MonitorsRedirect,
});

function MonitorsRedirect() {
  const { orgSlug } = Route.useParams();
  return (
    <Navigate
      to="/$orgSlug/observability/alerts"
      params={{ orgSlug }}
      replace
    />
  );
}
