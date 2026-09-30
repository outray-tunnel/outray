import { createFileRoute } from "@tanstack/react-router";
import { StatusPageComponents } from "../status-page";

export const Route = createFileRoute("/$orgSlug/uptime/status-page/components")({
  head: () => ({ meta: [{ title: "Status page components - OutRay Uptime" }] }),
  component: StatusPageComponents,
});
