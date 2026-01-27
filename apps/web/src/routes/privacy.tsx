import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/components/landing/legal/PrivacyPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy - OutRay" },
    ],
  }),
  component: PrivacyPage,
});
