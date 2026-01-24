import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/components/landing/legal/TermsPage";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});
