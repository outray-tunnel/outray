import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgSlug/settings/profile")({
  head: () => ({ meta: [{ title: "Profile Settings - OutRay" }] }),
  component: ProfileSettingsView,
});

function ProfileSettingsView() {
  return <Navigate to="/account/settings" replace />;
}
