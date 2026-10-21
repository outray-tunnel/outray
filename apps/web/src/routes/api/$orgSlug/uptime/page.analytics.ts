import { createFileRoute } from "@tanstack/react-router";
import { getStatusAnalytics } from "@/lib/uptime/status-analytics.server";

export const Route = createFileRoute("/api/$orgSlug/uptime/page/analytics")({
  server: { handlers: { GET: ({ request, params }) => getStatusAnalytics(request, params.orgSlug) } },
});
