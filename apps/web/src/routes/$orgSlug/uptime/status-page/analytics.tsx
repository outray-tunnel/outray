import { createFileRoute } from "@tanstack/react-router";
import { StatusPageAnalytics } from "@/components/uptime/status-page-analytics";

export const Route = createFileRoute("/$orgSlug/uptime/status-page/analytics")({
  head: () => ({ meta: [{ title: "Status page analytics - OutRay Uptime" }] }),
  component: StatusPageAnalytics,
});
