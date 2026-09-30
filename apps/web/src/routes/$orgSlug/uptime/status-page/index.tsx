import { createFileRoute } from "@tanstack/react-router";
import { StatusPageOverview } from "../status-page";

export const Route = createFileRoute("/$orgSlug/uptime/status-page/")({
  head: () => ({ meta: [{ title: "Status page overview - OutRay Uptime" }] }),
  component: StatusPageOverview,
});
