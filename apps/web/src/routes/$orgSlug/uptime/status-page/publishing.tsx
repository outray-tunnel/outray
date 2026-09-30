import { createFileRoute } from "@tanstack/react-router";
import { StatusPagePublishing } from "../status-page";

export const Route = createFileRoute("/$orgSlug/uptime/status-page/publishing")({
  head: () => ({ meta: [{ title: "Status page publishing - OutRay Uptime" }] }),
  component: StatusPagePublishing,
});
