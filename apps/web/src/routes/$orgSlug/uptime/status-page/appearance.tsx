import { createFileRoute } from "@tanstack/react-router";
import { StatusPageAppearance } from "../status-page";

export const Route = createFileRoute("/$orgSlug/uptime/status-page/appearance")({
  head: () => ({ meta: [{ title: "Status page appearance - OutRay Uptime" }] }),
  component: StatusPageAppearance,
});
