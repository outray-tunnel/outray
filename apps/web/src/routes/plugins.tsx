import { createFileRoute } from "@tanstack/react-router";
import { PluginsPage } from "@/components/landing/plugins/PluginsPage";

export const Route = createFileRoute("/plugins")({
  head: () => ({
    meta: [
      { title: "Plugins - OutRay" },
    ],
  }),
  component: PluginsPage,
});
