import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/components/landing/legal/TermsPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service - OutRay" },
    ],
  }),
  component: TermsPage,
});
