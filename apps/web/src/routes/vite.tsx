import { createFileRoute } from "@tanstack/react-router";
import { VitePluginLanding } from "@/components/landing/vite-plugin/VitePluginLanding";

export const Route = createFileRoute("/vite")({
  component: VitePluginLanding,
});
