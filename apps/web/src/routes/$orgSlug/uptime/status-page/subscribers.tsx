import { createFileRoute } from "@tanstack/react-router";
import { StatusPageSubscribers } from "@/components/uptime/status-page-subscribers";

export const Route = createFileRoute("/$orgSlug/uptime/status-page/subscribers")({
  head: () => ({ meta: [{ title: "Status page subscribers - OutRay Uptime" }] }),
  component: StatusPageSubscribers,
});
