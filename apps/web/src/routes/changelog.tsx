import { createFileRoute } from "@tanstack/react-router";
import { ChangelogPage } from "@/components/landing/changelog/ChangelogPage";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: "Changelog - OutRay" },
    ],
  }),
  component: ChangelogPage,
});
