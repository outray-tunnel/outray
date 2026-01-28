import { createFileRoute } from "@tanstack/react-router";
import { ExpressPluginLanding } from "@/components/landing/express-plugin/ExpressPluginLanding";

export const Route = createFileRoute("/express")({
  head: () => ({
    meta: [
      { title: "Express Plugin - OutRay" },
    ],
  }),
  component: ExpressPluginLanding,
});
