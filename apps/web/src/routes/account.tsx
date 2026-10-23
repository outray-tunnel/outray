import { createFileRoute } from "@tanstack/react-router";
import { AccountSettingsLayout } from "@/components/workspace/account-settings-layout";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Personal settings - OutRay" }, { name: "robots", content: "noindex" }] }),
  component: AccountSettingsLayout,
});
