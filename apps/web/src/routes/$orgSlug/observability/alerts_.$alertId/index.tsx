import { createFileRoute } from "@tanstack/react-router";
import { AlertOverviewTab } from "../alerts_.$alertId";

export const Route = createFileRoute(
  "/$orgSlug/observability/alerts_/$alertId/",
)({
  head: () => ({ meta: [{ title: "Alert overview - OutRay Observability" }] }),
  component: AlertOverviewTab,
});
