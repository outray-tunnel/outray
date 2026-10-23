import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgSlug/settings")({
  head: () => ({ meta: [{ title: "Settings - OutRay" }] }),
  component: SettingsLayout,
});

function SettingsLayout() {
  return <div className="mx-auto w-full max-w-[960px]"><Outlet /></div>;
}
