import { createFileRoute } from "@tanstack/react-router";
import { NextPluginLanding } from "@/components/landing/next-plugin/NextPluginLanding";

export const Route = createFileRoute("/nextjs")({
  head: () => ({
    meta: [
      { title: "Next.js Plugin - OutRay" },
    ],
  }),
  component: NextPluginLanding,
});
