import { createFileRoute } from "@tanstack/react-router";
import { StatusPageHeadless } from "@/components/uptime/status-page-headless";

export const Route = createFileRoute("/$orgSlug/uptime/status-page/headless")({
  head: () => ({ meta: [{ title: "Headless status page - OutRay Uptime" }] }),
  component: StatusPageHeadless,
});
