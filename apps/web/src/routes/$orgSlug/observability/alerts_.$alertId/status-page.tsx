import { createFileRoute } from "@tanstack/react-router";
import { AlertStatusPageTab } from "@/components/observability/alert-status-page-tab";

export const Route = createFileRoute("/$orgSlug/observability/alerts_/$alertId/status-page")({
  head: () => ({ meta: [{ title: "Alert status page - OutRay Observability" }] }),
  component: AlertStatusPageTab,
});
