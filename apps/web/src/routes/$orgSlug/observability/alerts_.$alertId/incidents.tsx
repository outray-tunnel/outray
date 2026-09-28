import { createFileRoute } from "@tanstack/react-router";
import { AlertIncidentsTab } from "../alerts_.$alertId";

export const Route = createFileRoute(
  "/$orgSlug/observability/alerts_/$alertId/incidents",
)({
  head: () => ({ meta: [{ title: "Alert incidents - OutRay Observability" }] }),
  component: AlertIncidentsTab,
});
