import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgSlug/settings/connected-apps")({
  head: () => ({ meta: [{ title: "Connected apps - OutRay" }, { name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/account/settings/connected-apps" replace />,
});
