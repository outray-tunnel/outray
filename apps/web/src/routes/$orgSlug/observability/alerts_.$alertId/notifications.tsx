import { createFileRoute } from "@tanstack/react-router";
import { AlertNotificationsTab } from "../alerts_.$alertId";

export const Route = createFileRoute(
  "/$orgSlug/observability/alerts_/$alertId/notifications",
)({
  head: () => ({ meta: [{ title: "Alert notifications - OutRay Observability" }] }),
  component: AlertNotificationsTab,
});
