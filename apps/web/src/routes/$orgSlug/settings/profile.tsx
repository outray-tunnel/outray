import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { ProfileSettingsContent, SettingsLoading, SettingsUnavailable } from "@/components/workspace/settings-content";

export const Route = createFileRoute("/$orgSlug/settings/profile")({
  head: () => ({ meta: [{ title: "Profile Settings - OutRay" }] }),
  component: ProfileSettingsView,
});

function ProfileSettingsView() {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  // Background checks must not replace an already visible account with a skeleton.
  if (!session?.user && isPending) return <SettingsLoading />;
  if (!session?.user) return <SettingsUnavailable error={Boolean(error)} onRetry={() => { void refetch(); }} />;
  return <ProfileSettingsContent user={session.user} />;
}
