import { createFileRoute } from "@tanstack/react-router";
import { AlertConditionTab } from "../alerts_.$alertId";

export const Route = createFileRoute(
  "/$orgSlug/observability/alerts_/$alertId/condition",
)({
  head: () => ({ meta: [{ title: "Alert condition - OutRay Observability" }] }),
  component: AlertConditionTab,
});
