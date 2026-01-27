import { createFileRoute } from "@tanstack/react-router";
import { VitePluginLanding } from "@/components/landing/vite-plugin/VitePluginLanding";

export const Route = createFileRoute("/vite")({
  head: () => ({
    meta: [
      { title: "Vite Plugin - OutRay" },
    ],
  }),
  component: VitePluginLanding,
});
