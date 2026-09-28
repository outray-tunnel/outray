import { createFileRoute } from "@tanstack/react-router";
import { AlertEvaluationsTab } from "../alerts_.$alertId";

export const Route = createFileRoute(
  "/$orgSlug/observability/alerts_/$alertId/evaluations",
)({
  head: () => ({ meta: [{ title: "Alert evaluations - OutRay Observability" }] }),
  component: AlertEvaluationsTab,
});
